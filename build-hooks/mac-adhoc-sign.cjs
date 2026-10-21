// electron-builder afterPack hook — macOS only.
// Without a paid Apple certificate the app is left unsigned, and Apple Silicon Macs
// then report it as "damaged". An ad-hoc signature (free) turns that into the normal
// "unidentified developer" prompt, which the user can bypass with "Open Anyway".
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
};
