import "./vendor/interactably-core.js";
import "./vendor/modifiable.js";
import "./vendor/dirtyable.js";
import "./vendor/listable.js";
import "./vendor/revealable.js";
import "./vendor/requestable.js";
import "./vendor/prevent-default.js";
import { defineInteractableHost } from "./vendor/interactably-core.js";

// The demo markup is already in the document. Importing the bundles registers
// the implementations and defines the hosts for their tags, so the elements
// upgrade in place; a name that registers after an element connected attaches
// through the registry-changed re-check.
defineInteractableHost("button");
defineInteractableHost("form");
defineInteractableHost("section");
defineInteractableHost("div");
