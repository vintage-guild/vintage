// The component's database functions, which Better Auth calls through the Convex adapter.
import { createApi } from '@convex-dev/better-auth';
import { createAuthOptions } from '../auth';
import schema from './schema';

export const { create, findOne, findMany, updateOne, updateMany, deleteOne, deleteMany } =
  createApi(schema, createAuthOptions);
