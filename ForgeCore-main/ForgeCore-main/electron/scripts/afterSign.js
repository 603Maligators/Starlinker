#!/usr/bin/env node

/**
 * electron-builder afterSign hook stub.
 *
 * This is a placeholder for the real code-signing integration. When signing
 * certificates are available, replace the console.log call with the necessary
 * invocation to your signing service/tooling.
 */
module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  console.log(`[afterSign] ${electronPlatformName} build ready at ${appOutDir}. Integrate code signing here.`);
};
