# Events

## `events.defaultMaxListeners`

By default, a maximum of `10` listeners can be registered for any single event.
This limit can be changed for individual `EventEmitter` instances using the
`emitter.setMaxListeners(n)` method.

## Error events

If an `EventEmitter` does not have at least one listener registered for the
`'error'` event, and an `'error'` event is emitted, the error is thrown.
