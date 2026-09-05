// will-quit runs after windows have accepted closing. before-quit is too early: a user can cancel.
export const registerAppShutdown = ({ app, dispose, logger }) => {
  let complete = false,
    pending = null
  const onWillQuit = (event) => {
    if (complete) return
    event.preventDefault()
    if (pending) return
    pending = Promise.resolve()
      .then(dispose)
      .catch((error) => {
        logger('runtime.dispose-failed', {
          outcome: 'failed',
          reasonCode: 'RUNTIME_DISPOSE_FAILED',
          message: String(error.message).slice(0, 240),
        })
      })
      .finally(() => {
        complete = true
        app.quit()
      })
  }
  app.on('will-quit', onWillQuit)
  return () => app.removeListener('will-quit', onWillQuit)
}
