export interface FormData {
    consumerName: string
    consumerNumber: string
    mobileNumber: string
    email: string
    address: string
    reArrangementType: string
    reSource: string
    sanctionedCapacity: string
    capacityType: string
    projectModel: string
    installedCapacityRooftop: string
    installedCapacityTotal: string
    installedCapacityGround: string
    installationDate: string
    inverterCapacity: string
    inverterMake: string
    numberOfModules: string
    moduleCapacity: string
    category: string
    warrantyDetails: string
    sanctionNumber: string
    moduleManufacturer: string
    moduleWattage: string
    moduleSerialNumbers: string[]
    inverterModel: string
    inverterRating: string
    chargeControllerType: string
    earthingCount: string
    lightningArrester: string
    manufacturingYear: string
    aadharNumber: string
    cellManufacturer: string
    cellGSTInvoice: string
    cellGSTDate: string
    installerName: string
    installerDesignation: string
    installerPhone: string
    installerEmail: string
    companyName: string
    msedclOfficerName: string
    msedclOfficerDesignation: string
    msedclInspectionDate: string
    aadharImage?: string
    customerSignature?: string
    vendorSignature?: string
    companyStamp?: string
    // Additional fields for net meter agreement
    agreementDate: string
    consumerAddress: string
    systemCapacity: string
    vendorName: string
    msedclRepresentative: string
    // Additional fields for model agreement
    totalCost: string
    district: string
    invertercapacity : string
    invertermanufacture: string
}

