// Configuracion de monorepo tal como la documenta Expo: se vigila la raiz del
// workspace y se busca en los dos node_modules. Nada mas, porque el resto de
// la resolucion la resuelve el enlazado plano de pnpm (ver .npmrc).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
