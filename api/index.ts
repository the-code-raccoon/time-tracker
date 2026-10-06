import { dispatch } from '../server/router.js';

/** The app's only Vercel function: vercel.json rewrites every /api/* path here, and server/router.ts picks the route. */
export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
