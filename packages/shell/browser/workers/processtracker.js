class ProcessTracker {
  name
  processStarted // (process)
  processProgress // (process, stage, current, total)
  processCompleted // (process)

  constructor(name, options) {
    this.name = name
    this.processStarted = options.processStarted
    this.processProgress = options.processProgress
    this.processCompleted = options.processCompleted
    if (this.processStarted) this.processStarted(name)
  }

  progress(ev) {
    if (this.processProgress)
      this.processProgress(this.name, ev.phase, ev.loaded, ev.total, ev.type)
  }

  complete() {
    if (this.processCompleted) this.processCompleted(this.name)
  }
}

export default ProcessTracker
