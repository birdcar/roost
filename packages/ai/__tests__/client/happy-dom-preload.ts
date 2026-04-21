/**
 * Preload for the `test:client` script. Registers DOM globals before any React
 * test module loads so `@testing-library/react` can mount components. Must not
 * be loaded by the default `test` invocation — its global fetch replacement
 * breaks `spyOn(globalThis, 'fetch')` assertions elsewhere in the suite.
 *
 * See Phase 9 learning #2: P3 attempted a single-runner setup and reverted.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({
  url: 'http://localhost/',
  width: 1024,
  height: 768,
});
