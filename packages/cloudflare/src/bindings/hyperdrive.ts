export class HyperdriveClient {
  constructor(private hyperdrive: Hyperdrive) {}

  get connectionString(): string {
    return this.hyperdrive.connectionString;
  }

  get host(): string {
    return this.hyperdrive.host;
  }

  get port(): number {
    return this.hyperdrive.port;
  }

  get user(): string {
    return this.hyperdrive.user;
  }

  get password(): string {
    return this.hyperdrive.password;
  }

  get database(): string {
    return this.hyperdrive.database;
  }
}
