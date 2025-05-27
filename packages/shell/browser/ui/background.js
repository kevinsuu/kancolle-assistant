/* background.js
// message handling duties can be offloaded here from webui
// not currently used though

const handleMessage = function (msg, sender, sendresponse) {
  //const sourceTab = this.tabs().find((t) => t.id === sender.tab.id)
  //if (!!sourceTab) {
    ;(async () => {
    //console.log('>> from renderer: ', msg)
    if (msg?.type) {
      try {
        const result = await receiveFromRenderer(msg)
        console.log('Forwarded message from tab.', msg, result)
        sendresponse({ result, complete: true })
      } catch (error) {
        alert(
          `webui.js encountered an error handling message from renderer\nError: ${error}\nMessage:${JSON.stringify(msg)}\n`,
        )
        sendresponse({ error, complete: false })
      }
    } else alert('webui.js received invalid message from renderer\n' + JSON.stringify(msg))
    })()
    return true
  //} else {
    //if (msg?.type === 'set-config-item')
    //(async () => await this.getConfig())()
    //console.log('Received message from a tab in another window.', msg, sender)
    //console.log('Current tabs:', JSON.stringify(this.tabs().map(t => t.id)))
    //return false
  //}
}


const receiveFromRenderer = async function(msg) {
  switch (msg.type) {
    // Ignore (multiwindow)
    case 'kccp-log-update':
    case 'kccp-status':
    case 'kccp-log-recent':
      console.log('Ignoring message from other webUI.', msg)
      return
    // Passthrough to main
    case 'get-damecon-version':
    case 'get-damecon-info':
    case 'get-config':
    case 'get-config-item':
    case 'clear-cache':
    case 'kccp-get-status':
    case 'kccp-get-config':
    case 'kccp-save-config':
    case 'kccp-import-cache':
    case 'kccp-reload-cache':
    case 'kccp-verify-cache':
    case 'kccp-add-mod':
    case 'kccp-reload-mods':
    case 'kccp-prepatch':
    case 'kccp-extract-spritesheet':
    case 'kccp-make-outlines':
    case 'kccp-convert-poi':
    case 'kccp-log-get-recent':
    case 'kc3-doupdate':
    case 'kc3-get-isupdating':
    case 'kc3-select-custom-location':
    case 'select-custom-data-location':
      return await sendToMain(msg.type, msg.data)
    case 'set-config-item':
      const result = await sendToMain(msg.type, msg.data)
      //await this.getConfig()
      return result
    default:
      throw new Error(
        `webui.js received unknown message type from renderer:\n${JSON.stringify(msg)}`,
      )
  }
}

//const sendToMain = async function(type, data) {
  //return await ipc.send('webui-message', { type }, data)
//}

//chrome.runtime.onMessage.addListener(handleMessage)

*/
