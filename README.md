# Oracle Feeder

# Introduction

The RefractedLabs oracle feeder provides the basic abstraction to facilitate data collection, vote preparation, and oracle vote submission. Its primary function is periodically to submit votes to the RefractedLabs [oracle module](https://github.com/refractedlabs/oracle) on behalf of the validators, based on observed external data which is provided via `Plugin`s.

# Concepts

The feeder is designed to be extensible by `Plugin`s. Developers are required to implement the `Plugin` interface that is controlled by a `VoteManager` to prepare and vote for the external data which is already collected either by the `Plugin` itself or by any `Service`s which are already running in the background to collect the data.

## VoteManager

At the heart of the feeder design is a `VoteManager` with two main responsibilities: detecting the start of the next voting period of the oracle module by observing the chain for`EventVoteIntervalEnds`, and asking for data from the `Plugin`s for the next voting period and submitting an oracle vote into the oracle module using the data provided by the plugins.

The `VoteManager` is supposed to communicate with all plugins and commit a vote transaction within a vote interval. Vote interval breaks into two parts; the **preparation time** for plugins to perform any required operations before delivering final vote data, and the **reserved time** for collecting all plugins’ vote data to shape a single vote message and submitting it to the chain.

## Plugin

Plugin is the entity responsible for preparing module votes which are finally wrapped as an oracle vote (pre-vote and combined-vote) and submitted to the oracle module by the `VoteManager`. A plugin may provide any number of `ModuleVote`s each for a known module registered in the oracle module. Each module vote consists of any number of `NamespaceVote` each with a payload of string type.

The following code snippet presents the Plugin API and its related data types:

```tsx
export interface PreparationResult {
}

export abstract class Plugin {
		
    abstract start(): Promise<void>;

    abstract stop(): Promise<void>;

    abstract isStarted(): boolean;   

    async prepareForVote(event: EventVoteIntervalEnds, preparationTime: number): Promise<PreparationResult> {
        //TODO implement data preparation logic if any
    }

    onPreparationTimeout(event: EventVoteIntervalEnds) {    }

    abstract getModuleVotes(event: EventVoteIntervalEnds, preparationResult: PreparationResult): Promise<ModuleVote[]>;

}
```

Plugin extensions should implement the following methods:

- **start**
    
    This method contains the initialization tasks of a plugin.
    
- **stop**
    
    This method contains the finalization/clean-up tasks of a plugin.
    
- **isStarted**
    
    This method returns true if the plugin has started successfully, and false otherwise.
    
- **prepareForVote**
    
    This method may perform any prerequisites prior to the final data collection call by the `VoteManager`. The maximum available preparation time is passed to the function as the `preparationTime` argument. The data returned by this method is later passed to the **getModuleVotes** method.
    
- **getModuleVotes**
    
    This method should return `ModuleVotes` with respect to the current vote interval and the given `preparationResult` produced by the **prepareForVote** method invocation. Implementations should avoid performing long-running tasks, or the vote submission will be delayed and might be rejected by the oracle module if the vote deadline is missed.
    
    💡 `ModuleVotes` is an alias type for mapping between a module name and its corresponding `ModuleVote`. 
    

## Service

A `Service` is a standalone component started by the feeder at the beginning of feeder execution. It performs ongoing background tasks, which may include:

- Monitoring an external data source
- Processing collected data
- Storing the result in persistent storage to be used by plugins

The following code snippet presents the Service API:

```tsx
export abstract class Service<T extends ServiceConfiguration> {
   

    async start(): Promise<void> {
         //...
    }

    async doStart(): Promise<void> {
        this.doStartInBackground().then(() => {
            this.resolveStop()
        }).catch(this.rejectStop);
    }

    async doStartInBackground(): Promise<void> {
        return
    }

    async stop(): Promise<void> {
        //...
    }

    abstract cleanUp(): Promise<void>;

    isStarted(): boolean {
        //...
    }
}
```

A Service contains the following methods:

- **start, doStart**
    
    These methods contain the initialization tasks of a service. There is usually no need to override them.
    
- **stop**
    
    This method contains the finalization or clean-up tasks of a service. There is usually no need to override this method.
    
- **isStarted**
    
    This method returns true if the service has started successfully, and false otherwise.
    
- **doStartInBackground**
    
    This method may be implemented to perform long-running tasks in the background.
    
- **cleanUp**
    
    This method should be implemented to perform any clean-up tasks.
    

# Usage

The following code snippet demonstrates a sample usage of the oracle feeder, which includes the below main sections:

- Loading configurations and initializing loggers
- Instantiating OracleClient and feeder Context
- Registering services and plugins to the context
- Instantiating the feeder and starting it

```tsx
async function main() {
    // load configuration and initialize logger
    const config = await loadConfig("./config.yaml") as FeederConfiguration;
    initLogger(config.log)

    // initialize context
    const signer = await DirectSecp256k1HdWallet.fromMnemonic(config.keyStore.mnemonic, {prefix: "prism"})
    const oracleClient = new OracleClient({
        apiURL: config.tendermint.apiUrl,
        rpcURL: config.tendermint.rpcUrl,
        prefix: "prism"
    }, signer);
    const context = new Context(oracleClient, config);

    // register database service
    context.registerService(DATABASE_SERVICE_NAME,
        new DatabaseService(context, config.services[DATABASE_SERVICE_NAME] as DatabaseServiceConfiguration))

    // register sample monitoring service and sample plugin
    context.registerService(SAMPLE_MONITORING_SERVICE_NAME,
        new SampleMonitoringService(context, config.services[SAMPLE_MONITORING_SERVICE_NAME] as SampleMonitoringServiceConfiguration))
    context.registerPlugin(new SamplePlugin(context, config.plugins[SAMPLE_PLUGIN_NAME]))

    // initialize and start the feeder
    const oracleFeeder = await OracleFeeder.newInstance(context);
    await oracleFeeder.start()
}

main().catch((error) => {
    rootLogger.error("uncaught error", {error})
})
```

When the feeder starts, it starts the context which in turn will start the services. If all services have started successfully, it will then start all plugins. Both services and plugins are started in the order they were registered.

Plugins and services can get a handle on any registered service or plugin by using the context's `getPlugin` and `getService` methods.

# Configuration

The Feeder and its core components, like the vote manager, plugins and services, are all highly configurable. Their configuration structure is defined through interfaces, as shown in the following code snippet:

```tsx
export interface FeederConfiguration {
    log: LogConfiguration
    feeder: string
    validator: string
    broadcastTimeoutMs: number
    gasPrice: string
    preVoteFee: StdFee | "auto" | number
    combinedVoteFee: StdFee | "auto" | number
    voteReservedTimeMillis: number
    chainBlockCommitTimeoutMillis: number
    keyStore: KeyStoreConfiguration
    tendermint: TendermintConfiguration
    services: { [key: string]: ServiceConfiguration; }
    plugins: { [key: string]: PluginConfiguration; }
}

export interface KeyStoreConfiguration {
    mnemonic: string
}

export interface ServiceConfiguration {
    disable?: boolean;
}

export interface PluginConfiguration {
    disable?: boolean;
}

export interface TendermintConfiguration {
		rpcUrl: string;
    lcdUrl: string;
    grpcWebUrl: string;
    wsUrl: string;
    wsTimeout?: number;
    addressPrefix: string;
    denom: string;
}
```

**FeederConfiguration : chainBlockCommitTimeoutMillis**

An estimation for block generation time on the chain used by `VoteManager` to calculate preparation time. 

**FeederConfiguration : validator**

The valoper address of the validator used by `VoteManager` to set the validator property of pre-vote and combined-vote messages.

**FeederConfiguration : feeder**

The account address of the feeder that is allowed to submit votes on behalf of the validator.

**FeederConfiguration : preVoteFee and combinedVoteFee**

There are three types that can be accepted for `preVoteFee` and `combinedVoteFee` that each one will be explained briefly in the following sections.

If you provide `auto` as fee, when signing a pre-vote or vote message, first a transaction simulation is performed to estimate the gas and then the estimated gas is multiplied by a constant value (`1.3`)  which is finally used for fee calculation.

```jsx
preVoteFee: "auto"
```

In case the default constant is not desirable, you can provide another multiplier instead of using `auto` like below:

```jsx
preVoteFee: 2
```

Finally, in case you want to skip the transaction simulation step, you should provide all the required properties of the fee yourself, as well as determining `gasPrice`.

```jsx
gasPrice: "0.02uprism"
preVoteFee:
  amount:
    - denom: "uprism"
      amount: "0"
  gas: "250000"
```

**FeederConfiguration : services and plugins**

Services and plugins should extend `ServiceConfiguration` and `PluginConfiguration` respectively to define any custom configuration options. For example, a database service configuration might be defined as follows:

```tsx
export interface DatabaseServiceConfiguration extends ServiceConfiguration {
    database: DatabaseConfiguration
}

export interface DatabaseConfiguration {
    database: string,
    host: string,
    port: number,
    user: string,
    password: string,
    migrationPath: string
}
```

**KeyStoreConfiguration : mnemonic**

The mnemonic used by `VoteManager` for signing vote messages.

**TendermintConfiguration : wsUrl**

The websocket URL used by `VoteManager` to subscribe to `EventVoteIntervalEnds` events.

This YAML sample illustrates a possible configuration file structure:

```yaml
log:
  level: 'debug'
  dirname: 'logs'
  filename: 'feeder.log'
  maxSize: '1kb'
  maxFiles: 10
feeder: "prism1u5pnr446txcfzlq42v3h7j4p6232hgem7rdz0f"
validator: "prismvaloper156pcgs3faegfte0vuaykr9az3hh9kx2etftljf"
broadcastTimeoutMs: 5000
gasPrice: "0.02uprism"
preVoteFee: 2
combinedVoteFee: 2
voteReservedTimeMillis: 3000
prismBlockGenerationTimeMillis: 5000
keyStore:
  mnemonic: "injury moon patient local average edge car train start wet depend bundle barely coach rule fee pattern medal ridge regular degree elbow before sausage"
tendermint:
  rpcUrl: "http://localhost:26657"
  lcdUrl: "http://localhost:1317"
  grpcWebUrl: "http://localhost:9091"
  wsUrl: "ws://localhost:26657"
  wsTimeout: 5000
  addressPrefix: "prism"
  denom: "uprism"
services:
  databaseService:
    disable: false
    database:
      database: "feeder"
      host: "localhost"
      port: 5432
      user: "postgres"
      password: "postgres"
      migrationPath: "./migrations"
  sampleMonitoringService:
    disable: false
plugins:
  samplePlugin:
    disable: false
```

💡 The [prism-feeder](https://github.com/prism-finance/prism-feeder) project provides a complete implementation of a feeder that is built using the oracle-feeder project.