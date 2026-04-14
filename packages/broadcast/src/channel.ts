export class Channel {
  constructor(readonly name: string) {}
}

export class PrivateChannel extends Channel {}

export class PresenceChannel extends Channel {}
