import "./vendor/interactably-core.js";
import "./vendor/modifiable.js";
import "./vendor/dirtyable.js";
import "./vendor/listable.js";
import "./vendor/revealable.js";
import "./vendor/requestable.js";
import "./vendor/prevent-default.js";
import "./vendor/attributable.js";
import "./vendor/logger.js";
import "./vendor/validatable.js";
import "./vendor/storable.js";
import "./vendor/copyable.js";
import "./vendor/no-propagate.js";
import "./vendor/auto-grow.js";
import "./vendor/paste-transform.js";
import "./vendor/json-template.js";
import "./vendor/formattable.js";
import { start } from "./vendor/interactably-core.js";

// The demo markup is already in the document. Importing the bundles registers
// the implementations, and start() attaches every participant — anything with an
// implements or on-* attribute — through one document-level observer.
start();