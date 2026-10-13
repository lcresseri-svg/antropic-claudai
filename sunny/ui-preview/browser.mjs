import {createRequire} from 'node:module';
const require=createRequire((process.env.SUNNY_NODE_PACKAGES||'/workspace/cloud-setup/node_modules')+'/package.json');
export const {chromium}=require('playwright');
export const browserOptions={headless:true,...(process.env.SUNNY_BROWSER?{executablePath:process.env.SUNNY_BROWSER}:{channel:'msedge'})};
