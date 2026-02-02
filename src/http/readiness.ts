let _ready = false

export function isReady() {
    return _ready
}

export function setReady(v = true) {
    _ready = v
}

export function resetReady() {
    _ready = false
}
