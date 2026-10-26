const tasks = [];
const pendingErrors = [];
const rAF = globalThis.requestAnimationFrame;
let updateAsync = true;
function throwFirstError() {
    if (pendingErrors.length) {
        throw pendingErrors.shift();
    }
}
function tryRunTask(task) {
    try {
        task.call();
    }
    catch (error) {
        if (updateAsync) {
            pendingErrors.push(error);
            setTimeout(throwFirstError, 0);
        }
        else {
            tasks.length = 0;
            throw error;
        }
    }
}
function process() {
    const capacity = 1024;
    let index = 0;
    while (index < tasks.length) {
        tryRunTask(tasks[index]);
        index++;
        if (index > capacity) {
            for (let scan = 0, newLength = tasks.length - index; scan < newLength; scan++) {
                tasks[scan] = tasks[scan + index];
            }
            tasks.length -= index;
            index = 0;
        }
    }
    tasks.length = 0;
}
function enqueue(callable) {
    tasks.push(callable);
    if (tasks.length < 2) {
        updateAsync ? rAF(process) : process();
    }
}
/**
 * The default UpdateQueue.
 * @public
 */
export const Updates = Object.freeze({
    enqueue,
    next: () => new Promise(enqueue),
    process,
    setMode: (isAsync) => (updateAsync = isAsync),
});
