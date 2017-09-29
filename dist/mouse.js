(function () {


	// main function

	function on (node, eventName, filter, handler) {
		// normalize parameters
		if (typeof node === 'string') {
			node = getNodeById(node);
		}

		// prepare a callback
		var callback = makeCallback(node, filter, handler);

		// functional event
		if (typeof eventName === 'function') {
			return eventName(node, callback);
		}

		// special case: keydown/keyup with a list of expected keys
		// TODO: consider replacing with an explicit event function:
		// var h = on(node, onKeyEvent('keyup', /Enter,Esc/), callback);
		var keyEvent = /^(keyup|keydown):(.+)$/.exec(eventName);
		if (keyEvent) {
			return onKeyEvent(keyEvent[1], new RegExp(keyEvent[2].split(',').join('|')))(node, callback);
		}

		// handle multiple event types, like: on(node, 'mouseup, mousedown', callback);
		if (/,/.test(eventName)) {
			return on.makeMultiHandle(eventName.split(',').map(function (name) {
				return name.trim();
			}).filter(function (name) {
				return name;
			}).map(function (name) {
				return on(node, name, callback);
			}));
		}

		// handle registered functional events
		if (Object.prototype.hasOwnProperty.call(on.events, eventName)) {
			return on.events[eventName](node, callback);
		}

		// special case: loading an image
		if (eventName === 'load' && node.tagName.toLowerCase() === 'img') {
			return onImageLoad(node, callback);
		}

		// special case: mousewheel
		if (eventName === 'wheel') {
			// pass through, but first curry callback to wheel events
			callback = normalizeWheelEvent(callback);
			if (!hasWheel) {
				// old Firefox, old IE, Chrome
				return on.makeMultiHandle([
					on(node, 'DOMMouseScroll', callback),
					on(node, 'mousewheel', callback)
				]);
			}
		}

		// special case: keyboard
		if (/^key/.test(eventName)) {
			callback = normalizeKeyEvent(callback);
		}

		// default case
		return on.onDomEvent(node, eventName, callback);
	}

	// registered functional events
	on.events = {
		// handle click and Enter
		button: function (node, callback) {
			return on.makeMultiHandle([
				on(node, 'click', callback),
				on(node, 'keyup:Enter', callback)
			]);
		},

		// custom - used for popups 'n stuff
		clickoff: function (node, callback) {
			// important note!
			// starts paused
			//
			var bHandle = on(node.ownerDocument.documentElement, 'click', function (e) {
				var target = e.target;
				if (target.nodeType !== 1) {
					target = target.parentNode;
				}
				if (target && !node.contains(target)) {
					callback(e);
				}
			});

			var handle = {
				state: 'resumed',
				resume: function () {
					setTimeout(function () {
						bHandle.resume();
					}, 100);
					this.state = 'resumed';
				},
				pause: function () {
					bHandle.pause();
					this.state = 'paused';
				},
				remove: function () {
					bHandle.remove();
					this.state = 'removed';
				}
			};
			handle.pause();

			return handle;
		}
	};

	// internal event handlers

	function onDomEvent (node, eventName, callback) {
		node.addEventListener(eventName, callback, false);
		return {
			remove: function () {
				node.removeEventListener(eventName, callback, false);
				node = callback = null;
				this.remove = this.pause = this.resume = function () {};
			},
			pause: function () {
				node.removeEventListener(eventName, callback, false);
			},
			resume: function () {
				node.addEventListener(eventName, callback, false);
			}
		};
	}

	function onImageLoad (node, callback) {
		var handle = on.makeMultiHandle([
			on.onDomEvent(node, 'load', onImageLoad),
			on(node, 'error', callback)
		]);

		return handle;

		function onImageLoad (e) {
			var interval = setInterval(function () {
				if (node.naturalWidth || node.naturalHeight) {
					clearInterval(interval);
					e.width  = e.naturalWidth  = node.naturalWidth;
					e.height = e.naturalHeight = node.naturalHeight;
					callback(e);
				}
			}, 100);
			handle.remove();
		}
	}

	function onKeyEvent (keyEventName, re) {
		return function (node, callback) {
			return on(node, keyEventName, function (e) {
				if (re.test(e.key)) {
					callback(e);
				}
			});
		};
	}

	// internal utilities

	var hasWheel = (function hasWheelTest () {
		var
			isIE = navigator.userAgent.indexOf('Trident') > -1,
			div = document.createElement('div');
		return "onwheel" in div || "wheel" in div ||
			(isIE && document.implementation.hasFeature("Events.wheel", "3.0")); // IE feature detection
	})();

	var matches;
	['matches', 'matchesSelector', 'webkit', 'moz', 'ms', 'o'].some(function (name) {
		if (name.length < 7) { // prefix
			name += 'MatchesSelector';
		}
		if (Element.prototype[name]) {
			matches = name;
			return true;
		}
		return false;
	});

	function closest (element, selector, parent) {
		while (element) {
			if (element[on.matches] && element[on.matches](selector)) {
				return element;
			}
			if (element === parent) {
				break;
			}
			element = element.parentElement;
		}
		return null;
	}

	var INVALID_PROPS = {
		isTrusted: 1
	};
	function mix (object, value) {
		if (!value) {
			return object;
		}
		if (typeof value === 'object') {
			for(var key in value){
				if (!INVALID_PROPS[key]) {
					object[key] = value[key];
				}
			}
		} else {
			object.value = value;
		}
		return object;
	}

	var ieKeys = {
		//a: 'TEST',
		Up: 'ArrowUp',
		Down: 'ArrowDown',
		Left: 'ArrowLeft',
		Right: 'ArrowRight',
		Esc: 'Escape',
		Spacebar: ' ',
		Win: 'Command'
	};

	function normalizeKeyEvent (callback) {
		// IE uses old spec
		return function (e) {
			if (ieKeys[e.key]) {
				var fakeEvent = mix({}, e);
				fakeEvent.key = ieKeys[e.key];
				callback(fakeEvent);
			} else {
				callback(e);
			}
		}
	}

	var
		FACTOR = navigator.userAgent.indexOf('Windows') > -1 ? 10 : 0.1,
		XLR8 = 0,
		mouseWheelHandle;

	function normalizeWheelEvent (callback) {
		// normalizes all browsers' events to a standard:
		// delta, wheelY, wheelX
		// also adds acceleration and deceleration to make
		// Mac and Windows behave similarly
		return function (e) {
			XLR8 += FACTOR;
			var
				deltaY = Math.max(-1, Math.min(1, (e.wheelDeltaY || e.deltaY))),
				deltaX = Math.max(-10, Math.min(10, (e.wheelDeltaX || e.deltaX)));

			deltaY = deltaY <= 0 ? deltaY - XLR8 : deltaY + XLR8;

			e.delta  = deltaY;
			e.wheelY = deltaY;
			e.wheelX = deltaX;

			clearTimeout(mouseWheelHandle);
			mouseWheelHandle = setTimeout(function () {
				XLR8 = 0;
			}, 300);
			callback(e);
		};
	}

	function closestFilter (element, selector) {
		return function (e) {
			return on.closest(e.target, selector, element);
		};
	}

	function makeMultiHandle (handles) {
		return {
			state: 'resumed',
			remove: function () {
				handles.forEach(function (h) {
					// allow for a simple function in the list
					if (h.remove) {
						h.remove();
					} else if (typeof h === 'function') {
						h();
					}
				});
				handles = [];
				this.remove = this.pause = this.resume = function () {};
				this.state = 'removed';
			},
			pause: function () {
				handles.forEach(function (h) {
					if (h.pause) {
						h.pause();
					}
				});
				this.state = 'paused';
			},
			resume: function () {
				handles.forEach(function (h) {
					if (h.resume) {
						h.resume();
					}
				});
				this.state = 'resumed';
			}
		};
	}

	function getNodeById (id) {
		var node = document.getElementById(id);
		if (!node) {
			console.error('`on` Could not find:', id);
		}
		return node;
	}

	function makeCallback (node, filter, handler) {
		if (filter && handler) {
			if (typeof filter === 'string') {
				filter = closestFilter(node, filter);
			}
			return function (e) {
				var result = filter(e);
				if (result) {
					e.filteredTarget = result;
					handler(e, result);
				}
			};
		}
		return filter || handler;
	}

	function getDoc (node) {
		return node === document || node === window ? document : node.ownerDocument;
	}

	// public functions

	on.once = function (node, eventName, filter, callback) {
		var h;
		if (filter && callback) {
			h = on(node, eventName, filter, function () {
				callback.apply(window, arguments);
				h.remove();
			});
		} else {
			h = on(node, eventName, function () {
				filter.apply(window, arguments);
				h.remove();
			});
		}
		return h;
	};

	on.emit = function (node, eventName, value) {
		node = typeof node === 'string' ? getNodeById(node) : node;
		var event = getDoc(node).createEvent('HTMLEvents');
		event.initEvent(eventName, true, true); // event type, bubbling, cancelable
		return node.dispatchEvent(mix(event, value));
	};

	on.fire = function (node, eventName, eventDetail, bubbles) {
		node = typeof node === 'string' ? getNodeById(node) : node;
		var event = getDoc(node).createEvent('CustomEvent');
		event.initCustomEvent(eventName, !!bubbles, true, eventDetail); // event type, bubbling, cancelable, value
		return node.dispatchEvent(event);
	};

	// TODO: DEPRECATED
	on.isAlphaNumeric = function (str) {
		return /^[0-9a-z]$/i.test(str);
	};

	on.makeMultiHandle = makeMultiHandle;
	on.onDomEvent = onDomEvent; // use directly to prevent possible definition loops
	on.closest = closest;
	on.matches = matches;

	

	function mouse (parent, options) {
		options = options || {};
		var
			isConstrained = options.constrain || options.horizontal || options.vertical,
			constrain,
			upHandle,
			moveHandle,
			multiHandle,
			box,
			cBox,
			org,
			last,
			lastx,
			lasty,
			handles,
			downHandles = [],
			mouseTarget,
			realTarget,
			downNodes,
			isDown = false;

		if (options.downNodes) {
			downNodes = options.downNodes;
		} else {
			downNodes = [options.downNode || parent];
		}

		function findInList (target, targets) {
			var i, node;
			for (i = 0; i < targets.length; i++) {
				if (targets[i] === target) {
					return targets[i];
				}
			}
			return null;
		}

		function findTarget (child, targets) {
			var target;
			while (!target && child !== document.body) {
				target = findInList(child, targets);
				if (target) {
					return target;
				}
				child = child.parentNode;
			}
			return null;
		}

		function onMove (e) {
			e.preventDefault();
			var
				x = e.clientX - box.x,
				y = e.clientY - box.y;

			if (x > 0 && x < box.w) {
				last.x = x - lastx;
				lastx = x;
			}
			if (y > 0 && y < box.h) {
				last.y = y - lasty;
				lasty = y;
			}

			emit('move', x, y);
			return false;
		}

		function onDown (e) {
			isDown = true;
			box = getBox(parent);
			realTarget = e.target;
			mouseTarget = findTarget(e.target, downNodes);
			cBox = getBox(mouseTarget);

			var
				x = e.clientX - box.x,
				y = e.clientY - box.y;

			lastx = x;
			lasty = y;

			org = cBox;
			org.x -= box.x;
			org.y -= box.y;

			last = {
				x: 0,
				y: 0
			};
			multiHandle.resume();
			emit('down', x, y);
		}

		function onTrack (e) {
			if (isDown) {
				return;
			}
			box = getBox(parent);
			realTarget = e.target;
			mouseTarget = downNodes[0];
			cBox = getBox(mouseTarget);

			var
				x = e.clientX - box.x,
				y = e.clientY - box.y;

			lastx = x;
			lasty = y;

			org = cBox;
			org.x -= box.x;
			org.y -= box.y;

			last = {
				x: 0,
				y: 0
			};

			multiHandle.resume();
			emit('track', x, y);
		}

		function onUp (e) {
			isDown = false;
			multiHandle.pause();
		}

		moveHandle = on(window, 'mousemove', function (e) {
			onMove(e)
		});
		upHandle = on(window, 'mouseup', onUp);

		handles = [moveHandle, upHandle];

		if (options.track) {
			if (downNodes.length !== 1) { throw new Error('Only one downNode can be tracked'); }
			downHandles.push(on(parent, 'mousedown', onTrack));
		}

		downNodes.forEach(function (node) {
			downHandles.push(
				on(node, 'mousedown', onDown)
			);
		});

		if (isConstrained) {
			constrain = mouse.constrain(options);
			handles.push(
				on(parent, 'mouse', constrain)
			)
		}

		multiHandle = on.makeMultiHandle(handles);
		multiHandle.pause();
		return on.makeMultiHandle(downHandles);

		function emit (type, x, y) {
			on.emit(parent, 'mouse', {
				x: x,
				y: y,
				px: range(x / box.w, 0, 1),
				py: range(y / box.h, 0, 1),
				org: org,
				parent: box,
				last: last,
				dist: {
					x: x - org.x,
					y: y - org.y
				},
				up: type === 'up',
				down: type === 'down' || type === 'track',
				move: type === 'move',
				track: type === 'track',
				mouseType: type,
				mouseTarget: mouseTarget,
				realTarget: realTarget
			});
		}
	}

	mouse.constrain = function (options) {
		var dx, dy, dw, dh;
		return function (e) {
			if (e.down) {
				dx = e.org.x;
				dy = e.org.y;
				if (options.centerEdge) {
					dw = e.parent.w;
					dh = e.parent.h;
				} else {
					dw = e.parent.w - e.org.w;
					dh = e.parent.h - e.org.h;
				}
			}

			if (e.down && e.track) {
				dx = e.x - (options.centerEdge ? 0 : (e.org.w/2));
				dy = e.y - (options.centerEdge ? 0 : (e.org.h/2));
			} else {
				dx += e.last.x;
				dy += e.last.y;
			}

			dx = Math.max(0, Math.min(dx, dw));
			dy = Math.max(0, Math.min(dy, dh));
			pos(e.mouseTarget, dx, dy);
		}
	};

	function range (value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function pos (node, x, y) {
		node.style.left = x + 'px';
		node.style.top = y + 'px';
	}

	function getBox (node) {
		if (node === window) {
			node = document.documentElement;
		}

		var
			box = node.getBoundingClientRect();
		return {
			h: box.height,
			w: box.width,
			x: box.left,
			y: box.top
		};
	}

	
	window.on = on;
	window.mouse = mouse;
}());