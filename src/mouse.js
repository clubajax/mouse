(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD
		define(['on'], factory);
	}
	else if (typeof module === 'object' && module.exports) {
		// Node / CommonJS
		module.exports = factory(require('on'));
	}
	else {
		// Browser globals (root is window)
		root['mouse'] = factory(root.on);
	}
}(this, function (on) {
	'use strict';

	function mouse (parent, options) {
		options = options || {};
		var
			upHandle,
			moveHandle,
			downHandle,
			box,
			cBox,
			org,
			last,
			lastx,
			lasty,
			handles,
			mouseTarget,
			downNodes;

		if(options.downNodes){
			downNodes = options.downNodes;
		} else {
			downNodes = [options.downNode || parent];
		}

		function findInList (target, targets) {
			var i, node;
			for(i = 0; i < targets.length; i++){
				if(targets[i] === target){
					return targets[i];
				}
			}
			return null;
		}

		function findTarget (child, targets) {
			var target;
			while (!target && child !== document.body) {
				target = findInList(child, targets);
				if(target){
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

			if(x > 0 && x < box.w) {
				last.x = x - lastx;
				lastx = x;
			}
			if(y > 0 && y < box.h) {
				last.y = y - lasty;
				lasty = y;
			}

			emit('move', x, y);
			return false;
		}

		function onDown (e) {
			e.preventDefault();
			box = getBox(parent);
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
			moveHandle.resume();
			emit('down', x, y);
			return false;
		}

		function onUp (e) {
			moveHandle.pause();
		}

		moveHandle = on(window, 'mousemove', onMove);
		moveHandle.pause();
		upHandle = on(window, 'mouseup', onUp);

		handles = [moveHandle, upHandle];

		downNodes.forEach(function (node) {
			handles.push(
				on(node, 'mousedown', onDown)
			);
		});

		if(options.constrain || options.horizontal || options.vertical){
			handles.push(
				on(parent, 'mouse', mouse.constrain(options))
			)
		}

		return on.makeMultiHandle([moveHandle, downHandle, upHandle]);

		function emit (type, x, y) {
			on.emit(parent, 'mouse', {
				x: x,
				y: y,
				px: range(x/box.w, 0, 1),
				py: range(y/box.h, 0, 1),
				org: org,
				parent: box,
				last: last,
				dist:{
					x: x - org.x,
					y: y - org.y
				},
				up: type === 'up',
				down: type === 'down',
				move: type === 'move',
				mouseType: type,
				mouseTarget: mouseTarget
			});
		}
	}

	mouse.constrain = function (options) {
		var dx, dy, dw, dh;
		return function (e) {
			if (e.down) {
				dx = e.org.x;
				dy = e.org.y;
				if(options.centerEdge){
					dw = e.parent.w;
					dh = e.parent.h;
				} else {
					dw = e.parent.w - e.org.w;
					dh = e.parent.h - e.org.h;
				}
			}

			dx += e.last.x;
			dy += e.last.y;

			dx = Math.max(0, Math.min(dx, dw));
			dy = Math.max(0, Math.min(dy, dh));
			pos(e.mouseTarget, dx, dy);
		}
	};

	return mouse;

}));

function range (value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function pos (node, x, y) {
	node.style.left = x + 'px';
	node.style.top = y + 'px';
}

function getBox (node){
	if(node === window){
		node = document.documentElement;
	}

	var
		dimensions = node.getBoundingClientRect();
	return {
		top: dimensions.top,
		right: dimensions.right,
		bottom: dimensions.bottom,
		left: dimensions.left,
		height: dimensions.height,
		h: dimensions.height,
		width: dimensions.width,
		w: dimensions.width,
		scrollY: window.scrollY,
		scrollX: window.scrollX,
		x: dimensions.left + window.pageXOffset,
		y: dimensions.top + window.pageYOffset
	};
}