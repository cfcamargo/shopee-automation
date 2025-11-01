const _queue = [];

function addToQueue(offer) {
  _queue.push(offer);
}

function flushQueue() {
  const items = _queue.splice(0, _queue.length);
  return items;
}

function peekQueue() {
  return [..._queue];
}

module.exports = {
  addToQueue,
  flushQueue,
  peekQueue,
};
