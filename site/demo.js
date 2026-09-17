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
import { defineInteractableHost } from "./vendor/interactably-core.js";
import { installAutoLoader } from "./vendor/auto-loader.js";

// The demo markup is already in the document. Importing the bundles registers
// the implementations and defines the hosts for their tags, so the elements
// upgrade in place; a name that registers after an element connected attaches
// through the registry-changed re-check. Tag-less implementations (revealable,
// attributable, logger, …) declare no tags, so their hosts are defined here.
defineInteractableHost("button");
defineInteractableHost("form");
defineInteractableHost("section");
defineInteractableHost("div");
defineInteractableHost("details");
defineInteractableHost("dialog");
defineInteractableHost("nav");
defineInteractableHost("a");
defineInteractableHost("h2");
defineInteractableHost("h3");

installAutoLoader();
