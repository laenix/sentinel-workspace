export namespace main {
	
	export class FileChange {
	    state: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new FileChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.name = source["name"];
	    }
	}
	export class LocalContext {
	    tenantName: string;
	    subscription: string;
	    resourceGroup: string;
	    workspace: string;
	
	    static createFrom(source: any = {}) {
	        return new LocalContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tenantName = source["tenantName"];
	        this.subscription = source["subscription"];
	        this.resourceGroup = source["resourceGroup"];
	        this.workspace = source["workspace"];
	    }
	}
	export class MigrationResult {
	    successes: string[];
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new MigrationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.successes = source["successes"];
	        this.errors = source["errors"];
	    }
	}
	export class WatchlistLocalData {
	    metadata: string;
	    csv: string;
	
	    static createFrom(source: any = {}) {
	        return new WatchlistLocalData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metadata = source["metadata"];
	        this.csv = source["csv"];
	    }
	}

}

export namespace models {
	
	export class AzureSubscription {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new AzureSubscription(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class AzureWorkspace {
	    id: string;
	    name: string;
	    resourceGroup: string;
	    location: string;
	
	    static createFrom(source: any = {}) {
	        return new AzureWorkspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.resourceGroup = source["resourceGroup"];
	        this.location = source["location"];
	    }
	}

}

