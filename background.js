import { Options } from './modules/options.js';
import { IcIdentities } from '../modules/identities.js';

class IdentityChooser {
  constructor() {
    this.icOptions = new Options();
  }

  async run() {
    console.debug("IdentityChooser#run -- begin");

    try {
      await this.icOptions.setupDefaultOptions();
    } catch (error) {
      //
      // Workaround. Several users report issues with Cardboox and
      // Identity Chooser accessing the browser.local store
      // (https://github.com/speedball2001/identitychooser-mx/issues/18:
      //
      //    20:30:33.873 TransactionInactiveError: A request was placed
      //    against a transaction which is currently not active, or which
      //    is finished. IndexedDB.jsm:101:46
      //
      // Assuming that this error is caused by a timing issue while
      // accessing the store concurrently, we simply try to circumvent this by
      // reloading ourselves

      console.debug("Caught exception while reading settings. Reloading extension.", error);
      browser.runtime.reload();
    }

    browser.icApi.onIdentityChosen.addListener(
        (identityId, action, windowId, info) => this.identityChosen(identityId, action, windowId, info));
    console.debug('IdentityChooser#run: onIdentityChosen listener registered');

    console.debug('IdentityChooser#run: iterate over accounts and identities');
    var icIdentities = new IcIdentities(this.icOptions);
    var identities = await icIdentities.getIdentities();

    for (const identity of identities) {
      if (identity !== undefined){
        console.debug(`IdentityChooser#run: found ${identity.accountId}, ${identity.id}`);
        if (identity.showInMenu) {
          var icIdentity = {
            "id": identity.id,
            "label": identity.label
          }

          var isEnabledComposeMessage =
            await this.icOptions.isEnabledComposeMessage();
          if (isEnabledComposeMessage) {
            console.debug('IdentityChooser#run: add identity ',
              icIdentity,
              'to compose');
            browser.icApi.addIdentity(icIdentity, "compose");
          }

          var isEnabledReplyMessage =
            await this.icOptions.isEnabledReplyMessage();
          if (isEnabledReplyMessage) {
            console.debug('IdentityChooser#run: add identity ',
              icIdentity,
              'to reply');
            browser.icApi.addIdentity(icIdentity, "reply");

            console.debug('IdentityChooser#run: add identity ',
              icIdentity,
              'to replyAll');
            browser.icApi.addIdentity(icIdentity, "replyAll");
          }

          var isEnabledForwardMessage =
            await this.icOptions.isEnabledForwardMessage();
          if (isEnabledForwardMessage) {
            console.debug('IdentityChooser#run: add identity ',
              icIdentity,
              'to forward');
            browser.icApi.addIdentity(icIdentity, "forward");
          }
        }
      }
    }

    //
    // initialize UI of all open windows
    browser.windows.getCurrent().then((window) => this.initUI(window));

    //
    // listen to new window create events to init their UI
    browser.windows.onCreated.addListener((window) => this.initUI(window));
    console.debug('IdentityChooser#run: browser.windows.onCreated listener registered');
    console.debug("IdentityChooser#run -- end");
  }

  async initUI(window) {
    console.debug("IdentityChooser#initUI -- begin");
    console.debug(`IdentityChooser#initUI: window: ${window.type}`);

    if(window.type == "normal" ||
       window.type == "messageDisplay") {
      var isEnabledComposeMessage =
          await this.icOptions.isEnabledComposeMessage();
      if(isEnabledComposeMessage) {
        console.debug("IdentityChooser#initUI: initComposeMessageAction");
        browser.icApi.initComposeMessageAction(window.id);
      }

      var isEnabledReplyMessage =
          await this.icOptions.isEnabledReplyMessage();
      if(isEnabledReplyMessage) {
        console.debug("IdentityChooser#initUI: initReplyMessageAction");
        browser.icApi.initReplyMessageAction(window.id);
      }

      var isEnabledForwardMessage =
          await this.icOptions.isEnabledForwardMessage();
      if(isEnabledForwardMessage) {
        console.debug("IdentityChooser#initUI: initForwardMessageAction");
        browser.icApi.initForwardMessageAction(window.id);
      }
    }

    console.debug("IdentityChooser#initUI -- end");
  }

  async identityChosen(identityId, action, windowId, info) {
    console.debug('IdentityChooser#identityChosen -- begin');
    console.debug(`IdentityChooser#identityChosen: identityId: ${identityId}, action: ${action}, windowId: ${windowId}, info: ${info}`);

    var messageFormat = await browser.composePrefsApi.getMessageFormat(identityId);

    if(info.includes("Shift")) {
      if(messageFormat == "text/plain") {
        messageFormat = "text/html";
      } else {
        messageFormat = "text/plain";
      }
    }

    console.debug('IdentityChooser#identityChosen: messageFormat: ', messageFormat);
    if(action == "compose") {
      console.debug('IdentityChooser#identityChosen: open compose editor');
      if(messageFormat == "text/plain") {
        browser.compose.beginNew({
          "identityId": identityId,
          "isPlainText" : true
        });
      } else {
        browser.compose.beginNew({
          "identityId": identityId,
          "isPlainText" : false
        });
      }
    } else if(action == "reply") {
      var tabs = await browser.tabs.query({ "windowId": windowId, "active": true });
      for (let tab of tabs) {
        var msg = await browser.messageDisplay.getDisplayedMessage(tab.id);

        if(msg != null) {
          console.debug('IdentityChooser#identityChosen: reply to message: ', msg);

          if(messageFormat == "text/plain") {
            browser.compose.beginReply(msg.id,
                                       "replyToSender",
                                       { "identityId": identityId,
                                         "isPlainText" : true
                                       });
          } else {
            browser.compose.beginReply(msg.id,
                                       "replyToSender",
                                       { "identityId": identityId,
                                         "isPlainText" : false
                                       });
          }
        }
      }
    } else if(action == "replyAll") {
      var tabs = await browser.tabs.query({ "windowId": windowId, "active": true });
      for (let tab of tabs) {
        var msg = await browser.messageDisplay.getDisplayedMessage(tab.id);

        console.debug('IdentityChooser#identityChosen: reply all to  message: ',
                      msg);
        if(msg != null) {
          if(messageFormat == "text/plain") {
            browser.compose.beginReply(msg.id,
                                       "replyToAll",
                                       { "identityId": identityId,
                                         "isPlainText" : true
                                       });
          } else {
            browser.compose.beginReply(msg.id,
                                       "replyToAll",
                                       { "identityId": identityId,
                                         "isPlainText" : false
                                       });
          }
        }
      }
    } else if(action == "forward") {
      var forwardType = await browser.composePrefsApi.getForwardType();
      console.debug('IdentityChooser#identityChosen: forwardType: ',
                    forwardType);

      var tabs = await browser.tabs.query({ "windowId": windowId, "active": true });
      for (let tab of tabs) {
        var msg = await browser.messageDisplay.getDisplayedMessage(tab.id);
        var window = await browser.windows.getCurrent();

        console.debug('IdentityChooser#identityChosen: forward  message: ',
                      msg);
        if(msg != null) {
          if(!info.includes("Shift")) {
            browser.icForwardApi.beginForward(msg,
                                              forwardType,
                                              { "identityId": identityId,
                                                "format" : "Default"
                                              });
          } else {
            browser.icForwardApi.beginForward(msg,
                                              forwardType,
                                              { "identityId": identityId,
                                                "format" : "OppositeOfDefault"
                                              });
          }
        }
      }
    }

    console.debug('IdentityChooser#identityChosen -- end');
  }
}


async function waitForLoad() {
  let onCreate = new Promise(function(resolve, reject) {
    function listener() {
      browser.windows.onCreated.removeListener(listener);
      resolve(true);
    }
    browser.windows.onCreated.addListener(listener);
  });

  let windows = await browser.windows.getAll({windowTypes:["normal"]});
  if (windows.length > 0) {
    return false;
  } else {
    return onCreate;
  }
}

// self-executing async "main" function
(async () => {
  await waitForLoad();

  var identityChooser = new IdentityChooser();
  waitForLoad().then((isAppStartup) => identityChooser.run());
})()
