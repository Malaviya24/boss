export async function retry(task, { retries, delayMs, onRetry }) {
  let attempt = 0;

  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }

      attempt += 1;
      if (onRetry) {
        onRetry(error, attempt);
      }

      await sleep(delayMs);
    }
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
