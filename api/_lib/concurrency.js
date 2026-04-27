/**
 * Returns a scheduler that limits async tasks to `concurrency` running at once.
 * Usage:
 *   const limit = pLimit(5);
 *   await Promise.all(items.map(x => limit(() => fetchSomething(x))));
 */
export function pLimit(concurrency) {
  let active = 0;
  const queue = [];

  function run() {
    while (active < concurrency && queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active--;
          run();
        });
    }
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      run();
    });
  };
}
