// Milestone 2a transport spike: hand-written plain ESM, NOT built by any bundler.
// Proves a Blob-URL-imported module can resolve a bare specifier ("spike-dep")
// against the host document's <script type="importmap">.
import { spikeMessage } from "spike-dep";

export const message = `blob import ok; ${spikeMessage}`;
