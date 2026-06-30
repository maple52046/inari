// Container entrypoint for the standalone Next.js server.
//
// Container runtimes inject HOSTNAME set to the container id, which the
// standalone server would otherwise bind to and fail with getaddrinfo. We force
// all-interfaces binding here, before importing server.js so it reads this
// value at module evaluation. Dynamic import is required so the assignment runs
// first.
process.env.HOSTNAME = "0.0.0.0";
await import("./server.js");
