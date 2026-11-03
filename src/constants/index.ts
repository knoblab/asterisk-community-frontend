export const APP_NAME = 'asterisk* cnsh.space';
export const APP_VERSION = '1.5.16-patch.8';
export const COMMIT_HASH: string = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : '';
export const APP_FULL_VERSION = COMMIT_HASH ? `v${APP_VERSION} (${COMMIT_HASH})` : `v${APP_VERSION}`;
