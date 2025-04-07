# Timers

The `node:timers` module exposes a global API for scheduling functions.

## `setTimeout(callback[, delay])`

Schedules execution of a one-time `callback` after `delay` milliseconds.
When `delay` is larger than `2147483647` or less than `1`, the `delay` will be set to `1`.

```js
# this is a comment inside code, not a heading
setTimeout(() => {}, 10);
```

## `setInterval(callback[, delay])`

Schedules repeated execution of `callback` every `delay` milliseconds.
