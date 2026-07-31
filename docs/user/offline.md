# Working offline

The app keeps working without a connection:

- Your lists and todos stay visible (they're cached on your device).
- Adding, editing, completing, and deleting all work; changes are queued.
- The header shows **Offline · N queued** while disconnected. If your
  network is fine but your CalDAV server isn't answering, the status dot
  next to Settings turns red and pulses gently instead — no separate
  banner for a condition that's often just a brief blip.
- When the connection returns, queued changes upload in order,
  automatically.

If a todo was changed on the server while you were offline, your change
wins where possible; when it can't be applied, you'll see a small notice
and the server's version is shown instead.
