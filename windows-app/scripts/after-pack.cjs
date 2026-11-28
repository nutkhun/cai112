// electron-builder afterPack hook: puts the Blackhole Timer icon and version details into the
// Windows .exe using resedit (pure JavaScript), so building on Linux/macOS doesn't need Wine.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit');

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const version = context.packager.appInfo.version.split('.').map(Number);
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  // Icon: replace Electron's icon group with ours (all sizes in assets/icon.ico).
  const iconFile = Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.ico')));
  const group = Resource.IconGroupEntry.fromEntries(res.entries)[0];
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, group.id, group.lang, iconFile.icons.map((icon) => icon.data));

  // Version details shown in Explorer's Properties → Details.
  const info = Resource.VersionInfo.fromEntries(res.entries)[0];
  const lang = info.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
  info.setStringValues(lang, {
    ProductName: 'Blackhole Timer',
    FileDescription: 'Blackhole Timer',
    CompanyName: 'CAI112',
    InternalName: 'Blackhole Timer',
    OriginalFilename: 'Blackhole Timer.exe',
    LegalCopyright: '',
  });
  info.setFileVersion(version[0], version[1], version[2], 0, lang.lang);
  info.setProductVersion(version[0], version[1], version[2], 0, lang.lang);
  info.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • set icon and version info  file=${path.basename(exePath)}`);
};
