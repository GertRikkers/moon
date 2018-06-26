/**
 * Moon v1.0.0-alpha
 * Copyright 2016-2018 Kabir Shah
 * Released under the MIT License
 * https://kbrsh.github.io/moon
 */
(function(root, factory) {
	if (typeof module === "undefined") {
		root.Moon = factory();
	} else {
		module.exports = factory();
	}
}(this, function() {
	"use strict";

	var expressionRE = /"[^"]*"|'[^']*'|\d+[a-zA-Z$_]\w*|\.[a-zA-Z$_]\w*|[a-zA-Z$_]\w*:|([a-zA-Z$_]\w*)/g;
	var globals = ["NaN", "event", "false", "in", "null", "this", "true", "typeof", "undefined"];

	var parseTemplate = function (expression) {
		var dynamic = false;

		expression = expression.replace(expressionRE, function(match, name) {
			if (name === undefined || globals.indexOf(name) !== -1) {
				return match;
			} else {
				if (name[0] === "$") {
					return ("locals." + name);
				} else {
					dynamic = true;
					return ("instance." + name);
				}
			}
		});

		return {
			expression: expression,
			dynamic: dynamic
		};
	};

	var config = {
		silent: ("development" === "production") || (typeof console === "undefined")
	};

	var error = function (message) {
		if (config.silent === false) {
			console.error("[Moon] ERROR: " + message);
		}
	};

	var whitespaceRE = /^\s+$/;

	var valueEndRE = /[\s/>]/;

	var parseAttributes = function (index, input, length, attributes) {
		while (index < length) {
			var char = input[index];

			if (char === "/" || char === ">") {
				break;
			} else if (whitespaceRE.test(char)) {
				index += 1;
				continue;
			} else {
				var key = "";
				var value = (void 0);
				var expression = false;

				while (index < length) {
					char = input[index];

					if (char === "/" || char === ">" || whitespaceRE.test(char)) {
						value = "";
						break;
					} else if (char === "=") {
						index += 1;
						break;
					} else {
						key += char;
						index += 1;
					}
				}

				if (value === undefined) {
					var quote = (void 0);
					value = "";
					char = input[index];

					if (char === "\"" || char === "'") {
						quote = char;
						index += 1;
					} else if (char === "{") {
						quote = "}";
						expression = true;
						index += 1;
					} else {
						quote = valueEndRE;
					}

					while (index < length) {
						char = input[index];

						if ((typeof quote === "object" && quote.test(char)) || char === quote) {
							index += 1;
							break;
						} else {
							value += char;
							index += 1;
						}
					}
				}

				var dynamic = false;

				if (expression) {
					var template = parseTemplate(value);
					value = template.expression;
					dynamic = template.dynamic;
				}

				attributes.push({
					key: key,
					value: value,
					expression: expression,
					dynamic: dynamic
				});
			}
		}

		return index;
	};

	var parseOpeningTag = function (index, input, length, stack) {
		var element = {
			type: "",
			attributes: [],
			children: []
		};

		while (index < length) {
			var char = input[index];

			if (char === "/" || char === ">") {
				var attributes = element.attributes;
				var lastIndex = stack.length - 1;

				if (char === "/") {
					index += 1;
				} else {
					stack.push(element);
				}

				for (var i = 0; i < attributes.length;) {
					var attribute = attributes[i];

					if (attribute.key[0] === "#") {
						element = {
							type: attribute.key,
							attributes: [{
								key: "",
								value: attribute.value,
								expression: attribute.expression,
								dynamic: attribute.dynamic
							}],
							children: [element]
						};
						attributes.splice(i, 1);
					} else {
						i += 1;
					}
				}

				stack[lastIndex].children.push(element);

				index += 1;
				break;
			} else if ((whitespaceRE.test(char) && (index += 1)) || char === "=") {
				index = parseAttributes(index, input, length, element.attributes);
			} else {
				element.type += char;
				index += 1;
			}
		}

		return index;
	};

	var parseClosingTag = function (index, input, length, stack) {
		var type = "";

		for(; index < length; index++) {
			var char = input[index];

			if (char === ">") {
				index += 1;
				break;
			} else {
				type += char;
			}
		}

		var lastElement = stack.pop();
		if (type !== lastElement.type && "development" === "development") {
			error(("Unclosed tag \"" + (lastElement.type) + "\""));
		}

		return index;
	};

	var parseComment = function (index, input, length) {
		while (index < length) {
			var char0 = input[index];
			var char1 = input[index + 1];
			var char2 = input[index + 2];

			if (char0 === "<" && char1 === "!" && char2 === "-" && input[index + 3] === "-") {
				index = parseComment(index + 4, input, length);
			} else if (char0 === "-" && char1 === "-" && char2 === ">") {
				index += 3;
				break;
			} else {
				index += 1;
			}
		}

		return index;
	};

	var escapeRE = /(?:(?:&(?:amp|gt|lt|nbsp|quot);)|"|\\|\n)/g;
	var escapeMap = {
		"&amp;": '&',
		"&gt;": '>',
		"&lt;": '<',
		"&nbsp;": ' ',
		"&quot;": "\\\"",
		'\\': "\\\\",
		'"': "\\\"",
		'\n': "\\n"
	};

	var parseText = function (index, input, length, stack) {
		var content = "";

		for (; index < length; index++) {
			var char = input[index];

			if (char === "<" || char === "{") {
				break;
			} else {
				content += char;
			}
		}

		if (!whitespaceRE.test(content)) {
			stack[stack.length - 1].children.push({
				type: "#text",
				attributes: [{
					key: "",
					value: content.replace(escapeRE, function (match) { return escapeMap[match]; }),
					expression: false,
					dynamic: false
				}],
				children: []
			});
		}

		return index;
	};

	var parseExpression = function (index, input, length, stack) {
		var expression = "";

		for (; index < length; index++) {
			var char = input[index];

			if (char === "}") {
				index += 1;
				break;
			} else {
				expression += char;
			}
		}

		var template = parseTemplate(expression);
		stack[stack.length - 1].children.push({
			type: "#text",
			attributes: [{
				key: "",
				value: template.expression,
				expression: true,
				dynamic: template.dynamic
			}],
			children: []
		});

		return index;
	};

	var parse = function (input) {
		var length = input.length;

		var root = {
			element: 0,
			nextElement: 1,
			type: "#root",
			attributes: [],
			children: []
		};

		var stack = [root];

		for (var i = 0; i < length;) {
			var char = input[i];

			if (char === "<") {
				if (input[i + 1] === "!" && input[i + 2] === "-" && input[i + 3] === "-") {
					i = parseComment(i + 4, input, length);
				} else if (input[i + 1] === "/") {
					i = parseClosingTag(i + 2, input, length, stack);
				} else {
					i = parseOpeningTag(i + 1, input, length, stack);
				}
			} else if (char === "{") {
				i = parseExpression(i + 1, input, length, stack);
			} else {
				i = parseText(i, input, length, stack);
			}
		}

		return root;
	};

	var getElement = function (element) { return ("m" + element); };

	var setElement = function (element, code) { return ((getElement(element)) + "=" + code); };

	var createElement = function (type) { return ("m.ce(\"" + type + "\");"); };

	var createTextNode = function (content) { return ("m.ctn(" + content + ");"); };

	var createComment = function () { return "m.cc();"; };

	var attributeValue = function (attribute) { return attribute.expression ? attribute.value : ("\"" + (attribute.value) + "\""); };

	var setAttribute = function (element, attribute) { return ("m.sa(" + (getElement(element)) + ",\"" + (attribute.key) + "\"," + (attributeValue(attribute)) + ");"); };

	var addEventListener = function (element, type, handler) { return ("m.ael(" + (getElement(element)) + ",\"" + type + "\"," + handler + ");"); };

	var setTextContent = function (element, content) { return ("m.stc(" + (getElement(element)) + "," + content + ");"); };

	var appendChild = function (element, parent) { return ("m.ac(" + (getElement(element)) + "," + (getElement(parent)) + ");"); };

	var removeChild = function (element, parent) { return ("m.rc(" + (getElement(element)) + "," + (getElement(parent)) + ");"); };

	var insertBefore = function (element, reference, parent) { return ("m.ib(" + (getElement(element)) + "," + (getElement(reference)) + "," + (getElement(parent)) + ");"); };

	var directiveIf = function (ifState, ifReference, ifConditions, ifPortions, ifParent) { return ("m.di(" + (getElement(ifState)) + "," + (getElement(ifReference)) + "," + (getElement(ifConditions)) + "," + (getElement(ifPortions)) + "," + (getElement(ifParent)) + ");"); };

	var directiveFor = function (forIdentifiers, forValue, forReference, forPortion, forPortions, forLocals, forParent) { return ("m.df(" + forIdentifiers + "," + forValue + "," + (getElement(forReference)) + "," + (getElement(forPortion)) + "," + (getElement(forPortions)) + "," + (getElement(forLocals)) + "," + (getElement(forParent)) + ");"); };

	var generateMount = function (element, parent, insert) { return insert === undefined ? appendChild(element, parent) : insertBefore(element, insert, parent); };

	var generateAll = function (element, parent, root, insert) {
		switch (element.type) {
			case "#if": {
				element.ifState = root.nextElement++;
				element.ifReference = root.nextElement++;

				var ifConditions = root.nextElement++;
				var ifPortions = root.nextElement++;
				var ifConditionsCode = "[";
				var ifPortionsCode = "[";
				var separator = "";

				var siblings = parent.children;
				for (var i = siblings.indexOf(element); i < siblings.length; i++) {
					var sibling = siblings[i];
					if (sibling.type === "#if" || sibling.type === "#elseif" || sibling.type === "#else") {
						ifConditionsCode += separator + (sibling.type === "#else" ? "true" : attributeValue(sibling.attributes[0]));

						ifPortionsCode += separator + "function(locals){" + generate({
							element: root.nextElement,
							nextElement: root.nextElement + 1,
							type: "#root",
							attributes: [],
							children: sibling.children
						}, element.ifReference) + "}({})";

						separator = ",";
					} else {
						break;
					}
				}

				return [
					setElement(element.ifReference, createComment()) +
					generateMount(element.ifReference, parent.element, insert) +
					setElement(ifPortions, ifPortionsCode + "];"),

					setElement(ifConditions, ifConditionsCode + "];") +
					setElement(element.ifState, directiveIf(element.ifState, element.ifReference, ifConditions, ifPortions, parent.element)),

					getElement(element.ifState) + "[2]();"
				];
			}
			case "#elseif":
			case "#else": {
				return ["", "", ""];
			}
			case "#for": {
				var forAttribute = attributeValue(element.attributes[0]);
				var forIdentifiers = "[";
				var forValue = "";

				var forReference = root.nextElement++;
				var forPortion = root.nextElement++;
				var forPortions = root.nextElement++;
				var forLocals = root.nextElement++;

				var forIdentifier = "", separator$1 = "";

				for (var i$1 = 0; i$1 < forAttribute.length; i$1++) {
					var char = forAttribute[i$1];

					if (char === "," || (char === " " && forAttribute[i$1 + 1] === "i" && forAttribute[i$1 + 2] === "n" && forAttribute[i$1 + 3] === " " && (i$1 += 3))) {
						forIdentifiers += separator$1 + "\"" + forIdentifier.substring(7) + "\"";
						forIdentifier = "";
						separator$1 = ",";
					} else {
						forIdentifier += char;
					}
				}

				forIdentifiers += "]";
				forValue += forIdentifier;

				return [
					setElement(forReference, createComment()) +
					generateMount(forReference, parent.element, insert) +
					setElement(forPortion, "function(locals){" + generate({
						element: root.nextElement,
						nextElement: root.nextElement + 1,
						type: "#root",
						attributes: [],
						children: element.children
					}, forReference) + "};") +
					setElement(forPortions, "[];") +
					setElement(forLocals, "[];"),

					directiveFor(forIdentifiers, forValue, forReference, forPortion, forPortions, forLocals, parent.element),

					directiveFor(forIdentifiers, "[]", forReference, forPortion, forPortions, forLocals, parent.element)
				];
			}
			case "#text": {
				var textAttribute = element.attributes[0];
				var textElement = root.nextElement++;

				var textCode = setTextContent(textElement, attributeValue(textAttribute));
				var createCode = setElement(textElement, createTextNode("\"\""));
				var updateCode = "";

				if (textAttribute.dynamic) {
					updateCode += textCode;
				} else {
					createCode += textCode;
				}

				return [createCode + generateMount(textElement, parent.element, insert), updateCode, removeChild(textElement, parent.element)];
			}
			default: {
				var attributes = element.attributes;
				var children = element.children;
				element.element = root.nextElement++;

				var createCode$1 = setElement(element.element, createElement(element.type));
				var updateCode$1 = "";

				for (var i$2 = 0; i$2 < attributes.length; i$2++) {
					var attribute = attributes[i$2];
					var attributeCode = (void 0);

					if (attribute.key[0] === "@") {
						var eventHandler = root.nextElement++;
						createCode$1 += addEventListener(element.element, attribute.key.substring(1), ("function($event){" + (getElement(eventHandler)) + "($event);}"));
						attributeCode = setElement(eventHandler, ("function($event){locals.$event=$event;" + (attributeValue(attribute)) + ";};"));
					} else {
						attributeCode = setAttribute(element.element, attribute);
					}

					if (attribute.dynamic) {
						updateCode$1 += attributeCode;
					} else {
						createCode$1 += attributeCode;
					}
				}

				for (var i$3 = 0; i$3 < children.length; i$3++) {
					var childCode = generateAll(children[i$3], element, root);
					createCode$1 += childCode[0];
					updateCode$1 += childCode[1];
				}

				return [createCode$1 + generateMount(element.element, parent.element, insert), updateCode$1, removeChild(element.element, parent.element)];
			}
		}
	};

	var generate = function (tree, insert) {
		var children = tree.children;
		var create = "";
		var update = "";
		var destroy = "";

		for (var i = 0; i < children.length; i++) {
			var generated = generateAll(children[i], tree, tree, insert);

			create += generated[0];
			update += generated[1];
			destroy += generated[2];
		}

		var prelude = "var m" + tree.element;
		for (var i$1 = tree.element + 1; i$1 < tree.nextElement; i$1++) {
			prelude += ",m" + i$1;
		}

		return (prelude + ";return [function($_){" + (setElement(tree.element, "$_;")) + create + "},function(){" + update + "},function(){" + destroy + "}];");
	};

	var compile = function (input) {
		return generate(parse(input));
	};

	var createElement$1 = function (type) { return document.createElement(type); };

	var createTextNode$1 = function (content) { return document.createTextNode(content); };

	var createComment$1 = function () { return document.createComment(""); };

	var setAttribute$1 = function (element, key, value) {
		element.setAttribute(key, value);
	};

	var addEventListener$1 = function (element, type, handler) {
		element.addEventListener(type, handler);
	};

	var setTextContent$1 = function (element, content) {
		element.textContent = content;
	};

	var appendChild$1 = function (element, parent) {
		parent.appendChild(element);
	};

	var removeChild$1 = function (element, parent) {
		parent.removeChild(element);
	};

	var insertBefore$1 = function (element, reference, parent) {
		parent.insertBefore(element, reference);
	};

	var directiveIf$1 = function (ifState, ifReference, ifConditions, ifPortions, ifParent) {
		for (var i = 0; i < ifConditions.length; i++) {
			if (ifConditions[i]) {
				var ifPortion = ifPortions[i];

				if (ifState === ifPortion) {
					ifPortion[1]();
				} else {
					if (ifState) {
						ifState[2]();
					}

					ifPortion[0](ifParent);
					ifPortion[1]();

					ifState = ifPortion;
				}

				return ifState;
			}
		}
	};

	var directiveFor$1 = function (forIdentifiers, forValue, forReference, forPortion, forPortions, forLocals, forParent) {
		var previousLength = forPortions.length;
		var nextLength = forValue.length;
		var maxLength = previousLength > nextLength ? previousLength : nextLength;

		var keyIdentifier = forIdentifiers[1];
		var valueIdentifier = forIdentifiers[0];

		for (var i = 0; i < maxLength; i++) {
			if (i >= previousLength) {
				var forLocal = {};
				forLocal[keyIdentifier] = i;
				forLocal[valueIdentifier] = forValue[i];
				forLocals[i] = forLocal;

				var newForPortion = forPortion(forLocal);
				forPortions.push(newForPortion);

				newForPortion[0](forParent);
				newForPortion[1]();
			} else if (i >= nextLength) {
				forPortions.pop()[2]();
			} else {
				var forLocal$1 = forLocals[i];
				forLocal$1[keyIdentifier] = i;
				forLocal$1[valueIdentifier] = forValue[i];

				forPortions[i][1]();
			}
		}
	};

	var m = {
		ce: createElement$1,
		ctn: createTextNode$1,
		cc: createComment$1,
		sa: setAttribute$1,
		ael: addEventListener$1,
		stc: setTextContent$1,
		ac: appendChild$1,
		rc: removeChild$1,
		ib: insertBefore$1,
		di: directiveIf$1,
		df: directiveFor$1
	};

	var create = function(root) {
		this._view[0](root);
		this.emit("create");
	};

	var update = function(key, value) {
		var this$1 = this;

		if (key !== undefined) {
			if (typeof key === "object") {
				for (var childKey in key) {
					this$1[childKey] = key[childKey];
				}
			} else {
				this[key] = value;
			}
		}

		if (this._queued === false) {
			this._queued = true;

			var instance = this;
			setTimeout(function () {
				instance._view[1]();
				instance._queued = false;
				instance.emit("update");
			}, 0);
		}
	};

	var destroy = function() {
		this._view[2]();
		this.emit("destroy");
	};

	var on = function(type, handler) {
		var events = this._events;
		var handlers = events[type];

		if (handlers === undefined) {
			events[type] = [handler];
		} else {
			handlers.push(handler);
		}
	};

	var off = function(type, handler) {
		if (type === undefined) {
			this._events = {};
		} else if (handler === undefined) {
			this._events[type] = [];
		} else {
			var handlers = this._events[type];
			handlers.splice(handlers.indexOf(handler), 1);
		}
	};

	var emit = function(type, data) {
		var handlers = this._events[type];

		if (handlers !== undefined) {
			if (typeof handlers === "function") {
				handlers(data);
			} else {
				for (var i = 0; i < handlers.length; i++) {
					handlers[i](data);
				}
			}
		}
	};

	var component = function (name, data) {
		return function MoonComponent() {
			var this$1 = this;

			// Properties
			this._name = name;
			this._queued = false;

			// View
			if (typeof data.view === "string") {
				this._view = new Function("m", "instance", "locals", compile(data.view))(m, this, {});
			} else {
				this._view = data.view;
			}

			delete data.view;

			// Events
			var events = {};

			if (data.onCreate !== undefined) {
				events.create = data.onCreate.bind(this);
				delete data.onCreate;
			}

			if (data.onUpdate !== undefined) {
				events.update = data.onUpdate.bind(this);
				delete data.onUpdate;
			}

			if (data.onDestroy !== undefined) {
				events.destroy = data.onDestroy.bind(this);
				delete data.onDestroy;
			}

			this._events = events;

			// Data
			if (data === undefined) {
				data = {};
			} else if (typeof data === "function") {
				data = data();
			}

			for (var key in data) {
				var value = data[key];
				if (typeof value === "function") {
					this$1[key] = value.bind(this$1);
				} else {
					this$1[key] = value;
				}
			}

			// Methods
			this.create = create;
			this.update = update;
			this.destroy = destroy;
			this.on = on;
			this.off = off;
			this.emit = emit;
		};
	};

	function Moon(data) {
		var root = data.root;
		delete data.root;

		if (typeof root === "string") {
			root = document.querySelector(root);
		}

		var instanceComponent = component("", data);
		var instance = new instanceComponent();

		instance.create(root);
		instance.update();

		return instance;
	}

	Moon.extend = function (name, data) {
	};

	Moon.compile = compile;
	Moon.config = config;

	return Moon;
}));
