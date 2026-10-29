using System;
using System.IO;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Local-only bridge: a web page can request scans from Windows WIA through loopback.
internal static class Program
{
    private const string Prefix = "http://127.0.0.1:8765/";
    private const string JpegFormat = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

    [STAThread]
    private static void Main()
    {
        Console.Title = "Tejaswini Canon Scanner Bridge";
        Console.WriteLine("Tejaswini scanner bridge listening on " + Prefix);
        Console.WriteLine("Keep this window open while scanning from the website.");
        using (var server = new HttpListener())
        {
            server.Prefixes.Add(Prefix);
            try { server.Start(); }
            catch (Exception ex) { Console.WriteLine("Could not start local bridge: " + ex.Message); Console.ReadLine(); return; }
            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = server.GetContext(); } catch { break; }
                try { Handle(ctx); }
                catch (Exception ex) { Reply(ctx.Response, 500, new { error = ex.Message }); }
            }
        }
    }

    private static void Handle(HttpListenerContext c)
    {
        string origin = c.Request.Headers["Origin"] ?? "";
        bool trustedOrigin = IsTrustedOrigin(origin);
        if (trustedOrigin) {
            c.Response.Headers["Access-Control-Allow-Origin"] = origin;
            c.Response.Headers["Vary"] = "Origin";
            c.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            c.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        }
        c.Response.Headers["Cache-Control"] = "no-store";
        if (c.Request.HttpMethod == "OPTIONS") { c.Response.StatusCode = trustedOrigin ? 204 : 403; c.Response.Close(); return; }
        var path = c.Request.Url.AbsolutePath.ToLowerInvariant();
        if (path == "/status") { Reply(c.Response, 200, new { ready = true, bridge = "Tejaswini WIA scanner bridge" }); return; }
        if (path == "/devices") { Reply(c.Response, 200, new { devices = ListDevices() }); return; }
        if (path == "/scan" && c.Request.HttpMethod == "POST")
        {
            var body = new StreamReader(c.Request.InputStream, c.Request.ContentEncoding).ReadToEnd();
            var opts = Json.Deserialize<Dictionary<string, object>>(body) ?? new Dictionary<string, object>();
            int dpi = opts.ContainsKey("dpi") ? Math.Max(75, Math.Min(600, Convert.ToInt32(opts["dpi"]))) : 200;
            string mode = opts.ContainsKey("colorMode") ? Convert.ToString(opts["colorMode"]) : "grayscale";
            byte[] image = ScanOne(dpi, mode);
            Reply(c.Response, 200, new { fileName = "canon-scan-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".jpg", mimeType = "image/jpeg", dataUrl = "data:image/jpeg;base64," + Convert.ToBase64String(image) });
            return;
        }
        Reply(c.Response, 404, new { error = "Unknown endpoint" });
    }

    private static bool IsTrustedOrigin(string origin)
    {
        if (origin == "https://tejaswini-rts-generator.vercel.app") return true;
        return System.Text.RegularExpressions.Regex.IsMatch(
            origin,
            @"^https://tejaswini-rts-generator-git-[a-z0-9-]+-galaxy-tech-corporation\.vercel\.app$",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }

    private static List<object> ListDevices()
    {
        var result = new List<object>();
        dynamic manager = CreateWiaManager();
        dynamic infos = manager.DeviceInfos;
        for (int i = 1; i <= (int)infos.Count; i++)
        {
            dynamic info = infos.Item(i);
            if (Convert.ToInt32(info.Type) == 1)
            {
                string name = "WIA scanner";
                try { name = Convert.ToString(info.Properties.Item("Name").Value); } catch { }
                result.Add(new { id = Convert.ToString(info.DeviceID), name = name });
            }
        }
        return result;
    }

    private static byte[] ScanOne(int dpi, string mode)
    {
        dynamic manager = CreateWiaManager();
        dynamic infos = manager.DeviceInfos;
        dynamic chosen = null;
        for (int i = 1; i <= (int)infos.Count; i++)
        {
            dynamic info = infos.Item(i);
            if (Convert.ToInt32(info.Type) == 1) { chosen = info; break; }
        }
        if (chosen == null) throw new InvalidOperationException("Windows WIA did not find a scanner. Install the Canon scanner driver and check USB connection.");
        dynamic device = chosen.Connect();
        dynamic item = device.Items.Item(1);
        SetProperty(item.Properties, 6147, dpi);
        SetProperty(item.Properties, 6148, dpi);
        int intent = mode == "color" ? 1 : mode == "bw" ? 4 : 2;
        SetProperty(item.Properties, 6146, intent);
        dynamic img = item.Transfer(JpegFormat);
        string temp = Path.Combine(Path.GetTempPath(), "tejaswini-scan-" + Guid.NewGuid().ToString("N") + ".jpg");
        try { img.SaveFile(temp); return File.ReadAllBytes(temp); }
        finally { try { if (File.Exists(temp)) File.Delete(temp); } catch { } }
    }

    private static object CreateWiaManager()
    {
        Type type = Type.GetTypeFromProgID("WIA.DeviceManager");
        if (type == null) throw new InvalidOperationException("Windows Image Acquisition (WIA) is unavailable on this PC.");
        return Activator.CreateInstance(type);
    }

    private static void SetProperty(dynamic props, object id, object value)
    {
        try { dynamic prop = props.Item(id); prop.Value = value; } catch { /* scanner driver may not expose this setting */ }
    }

    private static void Reply(HttpListenerResponse response, int status, object data)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(Json.Serialize(data));
        response.StatusCode = status; response.ContentType = "application/json; charset=utf-8"; response.ContentLength64 = bytes.Length;
        try { response.OutputStream.Write(bytes, 0, bytes.Length); } finally { response.Close(); }
    }
}