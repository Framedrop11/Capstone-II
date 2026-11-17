import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

configure({ asyncUtilTimeout: 2500 });

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
