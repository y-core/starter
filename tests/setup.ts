function suppressLogger(original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("{")) {
      try {
        const obj = JSON.parse(first);
        if ("level" in obj && "prefix" in obj && "message" in obj) return;
      } catch {}
    }
    original.apply(console, args);
  };
}

// Suppress structured logger output (JSON lines with level+prefix+message).
console.log = suppressLogger(console.log);
console.warn = suppressLogger(console.warn);
console.error = suppressLogger(console.error);
