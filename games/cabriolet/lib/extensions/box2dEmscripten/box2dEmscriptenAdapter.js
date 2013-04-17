/**
/**
/**
 * Project: darlingjs / GameEngine.
 *
 * Adapter for emscripten port of Box2D 2.2.1 to javascript
 *
 * Copyright (c) 2013, Eugene-Krevenets
 *
 */

(function(darlingjs, darlingutil) {
    'use strict';
    var m = darlingjs.module('ngBox2DEmscripten');

    /**
     * ngBox2DSystem.
     *
     * description: add Box2D physics simulation to entities.
     *
     */

    //using(Box2D, "b2.+");

    m.$s('ngBox2DSystem', {
        gravity: {x:0.0, y:0.0},
        PHYSICS_LOOP_HZ: 1.0 / 60.0,
        scale: 30.0,
        allowSleep: true,
        velocityIterations: 4,
        positionIterations: 4,

        _invScale: 1.0,

        _world: null,

        $require: ['ng2D', 'ngPhysic'],

        $added: function() {
            this._invScale = 1/this.scale;
            this._world = new Box2D.b2World(
                new Box2D.b2Vec2(this.gravity.x, this.gravity.y) // Gravity vector
                //, !this.allowSleep // Don't allow sleep
            );
        },
        $removed: function() {
            if (this._world !== null) {
                Box2D.destroy(this._world);
            }
            this._world = null;
        },
        $addNode: ['$node', '$world', function($node, $world) {
            var ngPhysic = $node.ngPhysic;
            var ng2D = $node.ng2D;
            var ng2DSize = $node.ng2DSize;
            var ng2DRotation = $node.ng2DRotation;
            var ng2DCircle = $node.ng2DCircle;
            var ng2DPolygon = $node.ng2DPolygon;

            var bodyDef = new Box2D.b2BodyDef();
            switch(ngPhysic.type) {
                case 'static':
                    bodyDef.set_type(Box2D.b2_staticBody);
                    break;
                case 'kinematic':
                    bodyDef.set_type(Box2D.b2_kinematicBody);
                    break;
                default:
                    bodyDef.set_type(Box2D.b2_dynamicBody);
                    break;
            }

            var rotation = 0.0;
            var shape;
            var fixDef = new Box2D.b2FixtureDef();

            if (darlingutil.isDefined(ng2DSize)) {
                shape = new Box2D.b2PolygonShape();
                shape.SetAsBox(0.5 * ng2DSize.width * this._invScale, 0.5 * ng2DSize.height * this._invScale);
            } else if (darlingutil.isDefined(ng2DCircle)) {
                shape = new Box2D.b2CircleShape();
                shape.set_m_radius(ng2DCircle.radius * this._invScale);
            } else if (darlingutil.isDefined(ng2DPolygon)) {
                var vertexCount = ng2DPolygon.line.length;
                var buffer = Box2D.allocate(vertexCount * 8, 'float', Box2D.ALLOC_STACK);
                var offset = 0;
                for (var vertexIndex = 0 ; vertexIndex < vertexCount; vertexIndex++) {
                    var point = ng2DPolygon.line[vertexIndex];
                    Box2D.setValue(buffer+(offset), point.x * this._invScale, 'float'); // x
                    Box2D.setValue(buffer+(offset+4), point.y * this._invScale, 'float'); // y
                    offset += 8;
                }

                shape = new Box2D.b2PolygonShape();
                var ptr_wrapped = Box2D.wrapPointer(buffer, Box2D.b2Vec2);
                shape.Set(ptr_wrapped, ng2DPolygon.line.length);
            } else {
                //TODO : other shapes
                throw new Error('Shape type doesn\'t detected. Need to add component ng2DCircle or ng2DSize.');
            }

            fixDef.set_shape(shape);

            if (ng2DRotation) {
                rotation = ng2DRotation.rotation;
            }

            fixDef.set_restitution(ngPhysic.restitution);
            fixDef.set_friction(ngPhysic.friction);
            fixDef.set_density(ngPhysic.density);

            var body,
                isCreatedNew;

            if (ngPhysic.partOf) {
                body = getBox2DBodyByEntityName($world, ngPhysic.partOf);
            }

            if (body) {
                isCreatedNew = false;
                var parentNg2D = body.m_userData.ng2D;
                transformShape(shape,
                    (ng2D.x - parentNg2D.x) * this._invScale,
                    (ng2D.y - parentNg2D.y) * this._invScale,
                    rotation);
            } else {
                bodyDef.set_position(new Box2D.b2Vec2(ng2D.x * this._invScale, ng2D.y * this._invScale));
                bodyDef.set_angle(rotation);
                bodyDef.set_fixedRotation(ngPhysic.fixedRotation);
                body = this._world.CreateBody(bodyDef);
                isCreatedNew = true;
            }

            //body.SetAngle(rotation);
            var fixture = ngPhysic._b2dFixture = body.CreateFixture(fixDef);
            fixture.m_userData = $node;

            ngPhysic._b2dBody = body;

            if (isCreatedNew) {
                body.m_userData = $node;
            }
        }],

        $removeNode: function($node) {
            var body = $node.ngPhysic._b2dBody;
            if (this._isEntityOwnBox2DBody($node)) {
                if (darlingutil.isDefined(body)) {
                    this._world.DestroyBody(body);
                    $node.ngPhysic._b2dBody = null;
                }
            } else if (this._isEntityOwnBox2DFixture($node)) {
                var fixture = $node.ngPhysic._b2dFixture;
                if (darlingutil.isDefined(fixture) && darlingutil.isDefined(body)) {
                    body.DestroyFixture(fixture);
                }
            }
        },

        _isEntityOwnBox2DBody: function(entity) {
            var body = entity.ngPhysic._b2dBody;
            if (darlingutil.isDefined(body)) {
                return body.m_userData === entity;
            }

            return false;
        },

        _isEntityOwnBox2DFixture: function(entity) {
            var fixture = entity.ngPhysic._b2dFixture;
            if (darlingutil.isDefined(fixture)) {
                return fixture.m_userData === entity;
            }

            return false;
        },

        $update: ['$nodes', '$time', function($nodes, $time) {
            this._world.Step(
                this.PHYSICS_LOOP_HZ,    //frame-rate
                this.velocityIterations, //velocity iterations
                this.positionIterations  //position iterations
            );

            $nodes.forEach(this.$$updateNodePosition);
            this._world.ClearForces();
        }],

        $$updateNodePosition: function($node) {
            var body = $node.ngPhysic._b2dBody;
            if (!body) {
                return;
            }
            var pos = body.GetPosition();

            var ng2D = $node.ng2D;
            ng2D.x = pos.get_x() * 30;//this.scale;
            ng2D.y = pos.get_y() * 30;//this.scale;

            var ng2DRotation = $node.ng2DRotation;
            if (ng2DRotation) {
                ng2DRotation.rotation = body.GetAngle();
            }
        },

        /**
         * Create joint instance by joint definition
         *
         * @param def
         * @return {*}
         */
        createJoint: function(def, CustomType) {
            return Box2D.castObject( this._world.CreateJoint(def), CustomType);
        },

        _getReyCastCallback: function () {
            if (this._getReyCastCallbackValue) {
                return this._getReyCastCallbackValue;
            }

            var callback = new Box2D.b2RayCastCallback();

            Box2D.customizeVTable(callback, [{
                original: Box2D.b2RayCastCallback.prototype.ReportFixture,
                replacement:
                    function(thsPtr, fixturePtr, pointPtr, normalPtr, fraction) {
                        var ths = Box2D.wrapPointer( thsPtr, Box2D.b2RayCastCallback );
                        var fixture = Box2D.wrapPointer( fixturePtr, Box2D.b2Fixture );
                        var point = Box2D.wrapPointer( pointPtr, Box2D.b2Vec2 );
                        var normal = Box2D.wrapPointer( normalPtr, Box2D.b2Vec2 );

                        if (ths.fixture === null) {
                            ths.fixture = fixture;
                            return true;
                        }

                        if (darlingutil.isArray(ths.fixtures)) {
                            ths.fixtures.push(fixture);
                        }

                        if (ths.handler) {
                            return ths.handler(fixture, point, normal, fraction);
                        }

                        return false;
                    }
            }]);

            this._getReyCastCallbackValue = callback;
            return this._getReyCastCallbackValue;
        },

        getFixturesBetween: function(point1, point2) {
            var raycastCallback = this._getReyCastCallback();
            raycastCallback.fixtures = [];
            this._world.RayCast(raycastCallback, point1, point2);
        },

        requestFixturesBetween: function(point1, point2, handler) {
            var raycastCallback = this._getReyCastCallback();
            raycastCallback.handler = handler;
            this._world.RayCast(raycastCallback, point1, point2);
        },

        /**
         * Get fixtures array by position
         *
         * @param x
         * @param y
         */
        getFixturesAt: function(x, y) {
            // Make a small box.
            var aabb = new Box2D.b2AABB();
            var d = 0.001;
            aabb.set_lowerBound(new Box2D.b2Vec2(x - d, y - d));
            aabb.set_upperBound(new Box2D.b2Vec2(x + d, y + d));

            // Query the world for overlapping shapes.
            var myQueryCallback = this._getQueryCallbackForAllFixtures();
            myQueryCallback.m_fixtures = [];
            myQueryCallback.m_point = new Box2D.b2Vec2(x, y);
            this._world.QueryAABB(myQueryCallback, aabb);

            return myQueryCallback.m_fixtures;
        },

        getOneBodyAt: function(x, y) {
            var fixture = this.getOneFixtureAt(x, y);
            if (fixture) {
                return fixture.GetBody();
            }
            return null;
        },

        /**
         * Get one fixture in point x, y
         * @param x
         * @param y
         * @return {*}
         */
        getOneFixtureAt: function(x, y) {
            // Make a small box.
            var aabb = new Box2D.b2AABB();
            var d = 0.1;
            aabb.set_lowerBound(new Box2D.b2Vec2(x - d, y - d));
            aabb.set_upperBound(new Box2D.b2Vec2(x + d, y + d));

            // Query the world for overlapping shapes.
            var myQueryCallback = this._getQueryCallbackForOneFixture();
            myQueryCallback.m_fixture = null;
            myQueryCallback.m_point = new Box2D.b2Vec2(x, y);
            this._world.QueryAABB(myQueryCallback, aabb);

            return myQueryCallback.m_fixture;
        },

        /**
         * Lazy initialization of querycallback function for queryAABB
         *
         * @private
         */
        _getQueryCallbackForOneFixture: function() {
            if (this._getQueryCallbackForOneFixtureValue) {
                return this._getQueryCallbackForOneFixtureValue;
            }

            var queryCallback = new Box2D.b2QueryCallback();
            this._getQueryCallbackForOneFixtureValue = queryCallback;

            Box2D.customizeVTable(queryCallback, [{
                original: Box2D.b2QueryCallback.prototype.ReportFixture,
                replacement:
                    function(thsPtr, fixturePtr) {
                        var ths = Box2D.wrapPointer( thsPtr, Box2D.b2QueryCallback );
                        var fixture = Box2D.wrapPointer( fixturePtr, Box2D.b2Fixture );

                        //if ( fixture.GetBody().GetType() !== Box2D.b2_dynamicBody ) //mouse cannot drag static bodies around
                        //    return true;
                        if ( ! fixture.TestPoint( ths.m_point ) ) {
                            return true;
                        }

                        ths.m_fixture = fixture;
                        return false;
                    }
            }]);

            return this._getQueryCallbackForOneFixtureValue;
        },

        /**
         * Lazy initialization of querycallback function for queryAABB
         *
         * @private
         */
        _getQueryCallbackForAllFixtures: function() {
            if (this._getQueryCallbackForAllFixturesValue) {
                return this._getQueryCallbackForAllFixturesValue;
            }

            var queryCallback = new Box2D.b2QueryCallback();
            this._getQueryCallbackForAllFixturesValue = queryCallback;

            Box2D.customizeVTable(queryCallback, [{
                original: Box2D.b2QueryCallback.prototype.ReportFixture,
                replacement:
                    function(thsPtr, fixturePtr) {
                        var ths = Box2D.wrapPointer( thsPtr, Box2D.b2QueryCallback );
                        var fixture = Box2D.wrapPointer( fixturePtr, Box2D.b2Fixture );

                        //if ( fixture.GetBody().GetType() !== Box2D.b2_dynamicBody ) //mouse cannot drag static bodies around
                        //    return true;
                        if ( ! fixture.TestPoint( ths.m_point ) )
                            return true;
                        ths.m_fixtures.push(fixture);
                        return true;
                    }
            }]);

            return this._getQueryCallbackForAllFixturesValue;
        },

        _addContactListener: function (callbacks) {
            var listener = new Box2D.Dynamics.b2ContactListener();

            if(callbacks.PostSolve) {
                listener.PostSolve = function (contact, impulse) {
                    callbacks.PostSolve(
                        contact.GetFixtureA().GetBody(),
                        contact.GetFixtureB().GetBody(),
                        impulse.normalImpulses[0]);
                };
            }


            this._world.SetContactListener(listener);
        },

        /**
         * b2World::GetGroundBody() is gone. So we need simulate it now
         * http://www.box2d.org/forum/viewtopic.php?f=3&t=5325
         *
         * @return {*}
         */
        getGroundBody: function() {
            if (this._groundBody) {
                return this._groundBody;
            }
            this._groundBody = this._world.CreateBody( new Box2D.b2BodyDef() );
            return this._groundBody;
        }
    });

    /**
     * Box2D Debug Draw System
     *
     */

    m.$s('ngBox2DDebugDraw', {
        $require: ['ng2D', 'ngPhysic'],
        _debugDrawVisible: false,

        _canvasHasCreated: false,
        _canvas: null,
        _context: null,

        _center: {x:0.0, y:0.0},

        useDebugDraw: true,
        domID: 'game',

        $added: ['ngBox2DSystem', function(ngBox2DSystem) {
            this.ngBox2DSystem = ngBox2DSystem;
            this.showDebugDrawVisible(this.useDebugDraw);
            this._center.x = 0.5 * this.width;
            this._center.y = 0.5 * this.height;
        }],

        $update: ['ng2DViewPort', function(ng2DViewPort) {
            //TODO: shift debug visualization
            var context = this._context;
            context.clearRect(0, 0, this.width, this.height);
            context.save();
                context.translate(this._center.x - ng2DViewPort.lookAt.x, this._center.y - ng2DViewPort.lookAt.y);
                context.scale(this.ngBox2DSystem.scale, this.ngBox2DSystem.scale);
                //context.scale(this.ngBox2DSystem.scale, this.ngBox2DSystem.scale);

                //black background
                //context.fillStyle = 'rgba(0,0,0,0)';
                //context.fillRect( 0, 0, this.width, this.height );
                context.fillStyle = 'rgb(255,255,0)';
                context.lineWidth /= this.ngBox2DSystem.scale;

                customDebugDraw.drawAxes(context);

                this.ngBox2DSystem._world.DrawDebugData();

            context.restore();
        }],

        showShape: function(value) {
            this._debugDraw.SetFlags(this._debugDraw.GetFlags() | e_shapeBit);
        },

        showJoint: function(value) {
            this._debugDraw.SetFlags(this._debugDraw.GetFlags() | e_jointBit);
        },

        showAABB: function(value) {
            this._debugDraw.SetFlags(this._debugDraw.GetFlags() | e_aabbBit);
        },

        showPair: function(value) {
            this._debugDraw.SetFlags(this._debugDraw.GetFlags() | e_pairBit);
        },

        showCenterOfMass: function(value) {
            this._debugDraw.SetFlags(this._debugDraw.GetFlags() | e_centerOfMassBit);
        },

        showDebugDrawVisible: function(visible) {
            if (this._debugDrawVisible === visible) {
                return;
            }

            this._debugDrawVisible = visible;

            if (this._debugDrawVisible) {
                var canvas = darlingutil.getCanvas(this.domID);

                if (canvas === null) {
                    canvas = darlingutil.placeCanvasInStack(this.domID, this.width, this.height);
                    this._canvasHasCreated = true;
                }

                this._canvas = canvas;
                this._context = canvas.getContext("2d");
                this._debugDraw = customDebugDraw.getCanvasDebugDraw(this._context);
                var flags = 0;
                flags |= e_shapeBit;
                flags |= e_jointBit;
                //flags |= e_aabbBit;
                //flats |= e_pairBit;
                flags |= e_centerOfMassBit;
                this._debugDraw.SetFlags(flags);
                this.ngBox2DSystem._world.SetDebugDraw(this._debugDraw);
            } else {
                this.ngBox2DSystem._world.SetDebugDraw(new Box2D.b2Draw());

                if (this._canvasHasCreated) {
                    darlingutil.removeCanvasFromStack(this._canvas);

                    this._canvasHasCreated = false;
                }

                this._canvas = null;

                this._debugDraw = null;
            }
        }
    });


    /**
     * ngBox2DDraggable
     *
     * Draggable subsystem based on ngBox2DSystem. And use it Box2D properties
     * to interact with dragged entity.
     *
     */
    m.$s('ngBox2DDraggable', {
        domId: 'game',
        width: 0,
        height: 0,

        $require: ['ngPhysic', 'ngDraggable'],

        $added: ['ngBox2DSystem', 'ng2DViewPort', function(ngBox2DSystem, ng2DViewPort) {
            this.scale = ngBox2DSystem.scale;
            this._invScale = ngBox2DSystem._invScale;

            this._target = document.getElementById(this.domId) || document.body;
            this._ng2DViewPort = ng2DViewPort;

            var pos = darlingutil.getElementAbsolutePos(this._target);

            this._shiftX = pos.x;
            this._shiftY = pos.y;

            var self = this;
            this._isMouseDown = false;
            document.addEventListener("mousedown", function(e) {
                self._isMouseDown = true;
                self._handleMouseMove(e);
                document.addEventListener("mousemove", mouseMoveHandler, true);
            }, true);

            document.addEventListener("mouseup", function() {
                document.removeEventListener("mousemove", mouseMoveHandler, true);
                self._isMouseDown = false;
            }, true);

            function mouseMoveHandler(e) {
                self._handleMouseMove(e);
            }
        }],

        _handleMouseMove: function (e) {
            this._mouseX = (e.clientX - this._shiftX - this._ng2DViewPort.lookAt.x + 0.5 * this.width) * this._invScale;
            this._mouseY = (e.clientY - this._shiftY - this._ng2DViewPort.lookAt.y + 0.5 * this.height) * this._invScale;
        },

        $update: ['$nodes', 'ngBox2DSystem', function($nodes, ngBox2DSystem) {
            var world;

            if (this._isMouseDown && !this._mouseJoint) {
                world = ngBox2DSystem._world;
                var body = ngBox2DSystem.getOneBodyAt(this._mouseX, this._mouseY);
                if(body && body.m_userData && body.m_userData.ngDraggable) {
                    var md = new Box2D.b2MouseJointDef();
                    md.set_bodyA(ngBox2DSystem.getGroundBody());
                    md.set_bodyB(body);
                    md.set_target(new Box2D.b2Vec2(this._mouseX, this._mouseY));
                    md.set_collideConnected(true);
                    md.set_maxForce(300.0 * body.GetMass());
                    this._mouseJoint = ngBox2DSystem.createJoint(md, Box2D.b2MouseJoint);
                    body.SetAwake(true);
                }
            }

            if(this._mouseJoint) {
                if(this._isMouseDown) {
                    this._mouseJoint.SetTarget(new Box2D.b2Vec2(this._mouseX, this._mouseY));
                } else {
                    world = ngBox2DSystem._world;
                    world.DestroyJoint(this._mouseJoint);
                    this._mouseJoint = null;
                }
            }
        }]
    });

    /**
     * ngBox2DRollingControl
     *
     * is Box2D subsystem.
     * description: control of box2d entity to roll it and jump.
     * usually fit to platform arcades like Mario Br.
     *
     */

    m.$s('ngBox2DRollingControl', {
        $require: ['ngControlPlatformStyle', 'ngPhysic'],
        useRotation: false,
        _actions: {},
        _keyBinding: [],
        _keyBind: function(keyId, action) {
            this._keyBinding[keyId] = action;
            this._actions[action] = false;
        },
        $added: function() {
            this._runImpulse = new Box2D.b2Vec2();
            this._jumpImpulse = new Box2D.b2Vec2();
            this._flyImpulse = new Box2D.b2Vec2();

            this._keyBind(87, 'move-up');
            this._keyBind(65, 'move-left');
            this._keyBind(83, 'move-down');
            this._keyBind(68, 'move-right');

            this._keyBind(37, 'move-left');
            this._keyBind(38, 'move-up');
            this._keyBind(39, 'move-right');
            this._keyBind(40, 'move-down');

            this._target = document.getElementById(this.domId) || document;
            var self = this;
            this._target.addEventListener('keydown', function(e) {
                var action = self._keyBinding[e.keyCode];
                if (action) {
                    self._actions[action] = true;
                }
            });
            this._target.addEventListener('keyup', function(e) {
                var action = self._keyBinding[e.keyCode];
                if (action) {
                    self._actions[action] = false;
                }
            });
            this.setUseRotation(this.useRotation);
        },
        setUseRotation: function(value) {
            this.useRotation = value;
            if (this.useRotation) {
                this._move = this._moveByRotation;
            } else {
                this._move = this._moveByImpulse;
            }
        },
        _moveByImpulse: function(body, speed) {
            this._runImpulse.set_x(speed);
            body.SetLinearVelocity(this._runImpulse);
        },
        _moveByRotation: function(body, speed) {
            body.SetAngularVelocity(3 * speed);
        },
        $removed: function() {
            //TODO : stop listening keys
        },
        _stayOnGroundDefined: false,
        _stayOnGround: false,
        //TODO : move to ngBox2dSystem
        _isStayOnGround: function(body, sharpCos) {
            if (this._stayOnGroundDefined) {
                return this._stayOnGround;
            }
            var contactEdge = body.GetContactList();
            while(contactEdge) {
                var contact = contactEdge.get_contact();
                if (contact.IsTouching()) {
                    if (this._isCirclesCollision(contact)) {
                        if (contactEdge.get_other().GetPosition().get_y() > body.GetPosition().get_y()) {
                            return true;
                        }
                    } else {
                        var ny;
                        //TODO: !!!!
                        var manifold = contact.GetManifold();
                        var norm = manifold.get_localNormal();
                        var sensor = false;
                        var fixtureA = contact.GetFixtureA();
                        var fixtureB = contact.GetFixtureB();
                        if (fixtureB.GetBody() !== body) {
                            if (fixtureB.IsSensor() ) {
                                sensor = true;
                            }
                            ny = norm.get_y();
                        } else {
                            if (fixtureA.IsSensor() ) {
                                sensor = true;
                            }
                            var angle = fixtureA.GetBody().GetAngle();
                            var sin = Math.sin(angle);
                            var cos = Math.cos(angle);
                            //var nx = cos * norm.x - sin * norm.y;
                            ny = sin * norm.get_x() + cos * norm.get_y();
                        }

                        if (!sensor && ny <= -sharpCos) {
                            this._stayOnGroundDefined = true;
                            this._stayOnGround = true;
                            return true;
                        }
                    }
                }
                contactEdge = getNextEdge(contactEdge);
            }
            this._stayOnGroundDefined = true;
            this._stayOnGround = false;
            return false;
        },

        _isCirclesCollision: function(contact) {
            return contact.GetFixtureA().GetShape().GetType() === 0 && contact.GetFixtureB().GetShape().GetType() === 0;
        },

        _resetDoubleJump: function(control) {
            this._justFly = false;
            control._jumpCount = 1;
        },
        _doubleJump: function($node, body, control) {
            if (++control._jumpCount > control.doubleJump || !control._hasJumped) {
                return;
            }

            this._jump(body, control);
        },
        _jump: function(body, control) {
            control._hasJumped = true;
            this._jumpImpulse.set_y(-control.jumpSpeed);
            if (this._actions['move-left']) {
                this._jumpImpulse.set_x(-control.runSpeed);
            } else if (this._actions['move-right']) {
                this._jumpImpulse.set_x(control.runSpeed);
            } else {
                this._jumpImpulse.set_x(0.0);
            }

            body.SetLinearVelocity(this._jumpImpulse);
//                    body.SetLinearVelocity(zeroVec2);
//                    body.ApplyImpulse(this._jumpImpulse, body.GetWorldCenter());
        },

        $removeNode: function($node) {
            var body = $node.ngPhysic._b2dBody;
            body.SetAngularVelocity(0);
        },

        $update: ['$node', function($node) {
            this._stayOnGroundDefined = false;
            var body = $node.ngPhysic._b2dBody;
            var control = $node.ngControlPlatformStyle;

            var fixRotation = false;

            if (this._actions['move-up']) {
                if (this._isStayOnGround(body, control.slope)) {
                    this._resetDoubleJump(control);
                    this._jump(body, control);
                } else if (this._justFly) {
                    this._doubleJump($node, body, control);
                    this._justFly = false;
                }
            } else {
                this._justFly = !this._isStayOnGround(body, control.slope);
                if (this._actions['move-left']) {
                    this._setMovingState($node, control, 'ngGoingLeft');
                    this._stayOnGroundDefined = false;
                    if (this._isStayOnGround(body, control.slope)) {
                        this._move(body, -control.runSpeed);
                    } else {
                        this._flyImpulse.set_x(-control.flySpeed);
                        body.ApplyLinearImpulse(this._flyImpulse, body.GetWorldCenter());
                    }
                } else if (this._actions['move-right']) {
                    this._setMovingState($node, control, 'ngGoingRight');
                    if (this._isStayOnGround(body, control.slope)) {
                        this._move(body, control.runSpeed);
                    } else {
                        this._flyImpulse.set_x(control.flySpeed);
                        body.ApplyLinearImpulse(this._flyImpulse, body.GetWorldCenter());
                    }
                } else {
                    fixRotation = true;
                }
            }

            if (fixRotation) {
                body.SetAngularVelocity(0);
                body.SetFixedRotation(true);
            } else {
                body.SetFixedRotation(false);
            }
        }],

        _setMovingState: function($node, control, value) {
            if (control._movingState === value) {
                return;
            }

            control._movingState = value;
            $node.$remove(control._movingState);
            $node.$add(value);
        }
    });

    /**
     * b2ContactEdge::get_next() never return null, except after last element, it's always return broken element.
     *
     * @param edge
     * @return {*}
     */
    function getNextEdge(edge) {
        var next = edge.get_next();
        var userData = next.get_contact().GetFixtureA().GetBody().m_userData;
        if (next === null || darlingutil.isUndefined(userData)) {
            return null;
        }
        return next;
    }


    /**
     * System for locking rotation of physics entities
     */
    m.$s('ngBox2DFixRotation', {
        $require: ['ngFixedRotation', 'ngPhysic'],

        $addNode: function($node) {
            $node.ngPhysic._b2dBody.SetFixedRotation(true);
        },

        $removeNode: function($node) {
            if ($node.ngPhysic._b2dBody) {
                $node.ngPhysic._b2dBody.SetFixedRotation(false);
            }
        }
    });

    m.$s('ngBox2DEnableMotorOnSensor', {
        $require: ['ngCollide', 'ngMotorSwitcher'],

        $addNode: ['$node', '$world', function($node, $world) {
            var entity = $world.$getByName($node.ngMotorSwitcher.targetId);
            if (entity) {
                $node.ngMotorSwitcher.targetEntity = entity;
                if (!entity.$has('ngEnableMotor')) {
                    entity.$add('ngEnableMotor');
                }
            }
        }],

        $removeNode: function($node) {
            var entity = $node.ngMotorSwitcher.targetEntity;
            if (entity) {
                entity.$remove('ngEnableMotor');
            }
        }
    });

    m.$s('ngBox2DEnableMotorSystem', {
        $require: ['ngEnableMotor', 'ngAnyJoint'],

        $addNode: function($node) {
            var joint = $node.ngAnyJoint.joint;

            if (joint) {
                joint.EnableMotor(true);
            }
        },

        $removeNode: function($node) {
            var joint = $node.ngAnyJoint.joint;

            if (joint) {
                joint.EnableMotor(false);
            }
        }
    });

    m.$s('ngBox2DMotorWithAcceleration', {
        $require: ['ngMotorWithAcceleration', 'ngEnableMotor', 'ngAnyJoint'],

        $addNode: function($node) {
            $node.ngMotorWithAcceleration.speed = $node.ngAnyJoint.joint.GetJointSpeed();
        },

        $update: ['$node', function($node) {
            var joint = $node.ngAnyJoint.joint,
                ngMotorWithAcceleration = $node.ngMotorWithAcceleration,
                speed = $node.ngMotorWithAcceleration.speed;

            var updateSpeed = false;
            if ($node.ngEnableMotorReverse) {
                speed -= ngMotorWithAcceleration.acceleration;
                if (speed >= ngMotorWithAcceleration.min) {
                    updateSpeed = true;
                }
            } else {
                speed += ngMotorWithAcceleration.acceleration;
                if (speed <= ngMotorWithAcceleration.max) {
                    updateSpeed = true;
                }
            }

            if (updateSpeed) {
                $node.ngMotorWithAcceleration.speed = speed;
                joint.SetMotorSpeed(speed);
            }
        }]
    });

    m.$s('ngBox2DSensorSystem', {
        $require: ['ngSensor', 'ngPhysic'],

        $addNode: function($node) {
            var physic = $node.ngPhysic;
            var body = physic._b2dBody;
            var fixture = body.GetFixtureList();
            var first = fixture;
            while(fixture) {
                fixture.SetSensor(true);
                var next = fixture.GetNext();
                if (fixture !== first) {
                    fixture = next;
                } else {
                    fixture = null;
                }
            }
        },

        $removeNode: function($node) {
            var physic = $node.ngPhysic;
            var body = physic._b2dBody;
            if (body) {
                var fixture = body.GetFixtureList();
                while(fixture) {
                    fixture.SetSensor(false);
                    fixture = fixture.GetNext();
                }
            }
        }
        /*
        ,

        $update: ['$node', function($node) {
            var physic = $node.ngPhysic;
            var body = physic._b2dBody;
            var edge = body.GetContactList();

            var touched = false;

            while(edge) {
                if (edge.get_contact().IsTouching()) {
                    touched = true;
                    break;
                }

                edge = getNextEdge(edge);
            }

            if (touched) {
                if (!$node.ngSensorDetectEntity) {
                    $node.$add('ngSensorAnyDetectOneEntity');
                }
            } else {
                $node.$remove('ngSensorAnyDetectOneEntity');
            }
        }]
        */
    });

    /**
     * ngBox2DRevoluteJoint
     *
     * Subsystem for emulate revolute joint
     *
     */
    m.$s('ngBox2DRevoluteJoint', {
        $require: ['ngRevoluteJoint', 'ng2D'],

        $addNode: ['$node', 'ngBox2DSystem', '$world', function($node, ngBox2DSystem, $world) {
            var jointState = $node.ngRevoluteJoint;
            var ng2D = $node.ng2D;

            var bodyA, bodyB;

            var x = ngBox2DSystem._invScale * ng2D.x,
                y = ngBox2DSystem._invScale * ng2D.y;

            if (darlingutil.isString(jointState.bodyA)) {
                bodyA = getBox2DBodyByEntityName($world, jointState.bodyA);
            }

            if (darlingutil.isString(jointState.bodyB)) {
                bodyB = getBox2DBodyByEntityName($world, jointState.bodyB);
            }

            var fixtures = ngBox2DSystem.getFixturesAt(x, y);

            switch (fixtures.length) {
                case 0:
                    throw new Error('Can\'t add revolute joint without jointed bodies');
                    break;
                case 1:
                    if (darlingutil.isUndefined(bodyA)) {
                        bodyA = fixtures[0].GetBody();
                        if (darlingutil.isUndefined(bodyB)) {
                            bodyB = ngBox2DSystem.getGroundBody();
                        }
                    } else if (darlingutil.isUndefined(bodyB)) {
                        bodyB = fixtures[0].GetBody();
                    }
                    break;
                default:
                    if (darlingutil.isUndefined(bodyA)) {
                        bodyA = fixtures[0].GetBody();
                        if (darlingutil.isUndefined(bodyB)) {
                            bodyB = fixtures[1].GetBody();
                        }
                    } else if (darlingutil.isUndefined(bodyB)) {
                        bodyB = fixtures[0].GetBody();
                    }
                    break;
            }

            var jointDef = new Box2D.b2RevoluteJointDef();
            jointDef.Initialize(bodyA, bodyB, new Box2D.b2Vec2(x, y));
            jointDef.set_collideConnected(jointState.collideConnected || false);
            jointDef.set_lowerAngle(jointState.lowerAngle);
            jointDef.set_upperAngle(jointState.upperAngle);
            jointDef.set_enableLimit(jointState.enableLimit);

            jointDef.set_maxMotorTorque(jointState.maxMotorTorque);
            jointDef.set_motorSpeed(jointState.motorSpeed);
            jointDef.set_enableMotor(jointState.enableMotor);

            jointState._joint = ngBox2DSystem.createJoint(jointDef, Box2D.b2RevoluteJoint);
            if (!$node.$has('ngAnyJoint')) {
                $node.$add('ngAnyJoint');
            }
            $node.ngAnyJoint.joint = jointState._joint;
        }],

        $update: ['$node', 'ngBox2DSystem', function($node, ngBox2DSystem) {
            var vec2 = $node.ngAnyJoint.joint.GetAnchorA();
            var ng2D = $node.ng2D;
            ng2D.x = vec2.get_x() * ngBox2DSystem.scale;
            ng2D.y = vec2.get_y() * ngBox2DSystem.scale;
        }]
    });

    /**
     * ngBox2DDistanceJoint
     *
     * Distance Joint
     *
     * One of the simplest joint is a distance joint which says that the distance between two points on two bodies must be constant. When you specify a distance joint the two bodies should already be in place. Then you specify the two anchor points in world coordinates. The first anchor point is connected to body 1, and the second anchor point is connected to body 2. These points imply the length of the distance constraint.
     *
     */
    m.$s('ngBox2DDistanceJoint', {
        $require: ['ngDistanceJoint'],

        $addNode: ['$node', 'ngBox2DSystem', function($node, box2DSystem) {
            var jointState = $node.ngDistanceJoint;
            var ng2D = $node.ng2D;
            var anchorA = new Box2D.b2Vec2(
                box2DSystem._invScale * (jointState.anchorA.x + ng2D.x),
                box2DSystem._invScale * (jointState.anchorA.y + ng2D.y)
            );
            var anchorB = new Box2D.b2Vec2(
                box2DSystem._invScale * (jointState.anchorB.x + ng2D.x),
                box2DSystem._invScale * (jointState.anchorB.y + ng2D.y)
            );
            var bodyA, bodyB;

            if (jointState.bodyA) {
                bodyA = jointState.bodyA;
            } else {
                bodyA = box2DSystem.getFixturesAt(anchorA.get_x(), anchorA.get_y())[0].GetBody();
                if (!bodyA) {
                    bodyA = box2DSystem.getGroundBody();
                }
            }

            if (jointState.bodyB) {
                bodyB = jointState.bodyB;
            } else {
                bodyB = box2DSystem.getFixturesAt(anchorB.get_x(), anchorB.get_y())[0].GetBody();
                if (!bodyB) {
                    bodyA = box2DSystem.getGroundBody();
                }
            }

            var jointDef = new Box2D.b2DistanceJointDef();
            jointDef.Initialize(bodyA, bodyB, anchorA, anchorB);
            jointDef.set_collideConnected(jointState.collideConnected);
            jointDef.set_frequencyHz(jointState.frequencyHz);
            jointDef.set_dampingRatio(jointState.dampingRatio);
            jointState._joint = box2DSystem.createJoint(jointDef, Box2D.b2DistanceJoint);
            if (!$node.$has('ngAnyJoint')) {
                $node.$add('ngAnyJoint');
            }
            $node.ngAnyJoint.joint = jointState._joint;
        }]
    });

    /**
     * ngBox2DDistanceJoint
     *
     * Prismatic Joint
     *
     * A prismatic joint allows for relative translation of two bodies along a specified axis. A prismatic joint prevents relative rotation. Therefore, a prismatic joint has a single degree of freedom.
     *
     */

    function getBox2DBodyByEntityName($world, name) {
        var entity = $world.$getByName(name);
        if (!entity) {
            return null;
        }

        var physic = entity.ngPhysic;
        if (!physic) {
            return null;
        }

        return physic._b2dBody;
    }

    m.$s('ngBox2DPrismaticJoint', {
        $require: ['ngPrismaticJoint'],

        $addNode: ['$node', 'ngBox2DSystem', '$world', function($node, box2DSystem, $world) {
            var jointState = $node.ngPrismaticJoint;
            var ng2D = $node.ng2D;
            var anchorA = new Box2D.b2Vec2(
                box2DSystem._invScale * (jointState.anchorA.x + ng2D.x),
                box2DSystem._invScale * (jointState.anchorA.y + ng2D.y)
            );
            var anchorB = new Box2D.b2Vec2(
                box2DSystem._invScale * (jointState.anchorB.x + ng2D.x),
                box2DSystem._invScale * (jointState.anchorB.y + ng2D.y)
            );

            var axis = new Box2D.b2Vec2(
                anchorB.get_x() - anchorA.get_x(),
                anchorB.get_y() - anchorA.get_y()
            );
            var bodyA,
                bodyB,
                lowerTranslation = 0.0,
                upperTranslation = axis.Length();

            if (jointState.bodyA) {
                if (darlingutil.isString(jointState.bodyA)) {
                    bodyA = getBox2DBodyByEntityName($world, jointState.bodyA);
                } else {
                    bodyA = jointState.bodyA;
                }
            } else {
                bodyA = box2DSystem.getOneBodyAt(anchorA.get_x(), anchorA.get_y());
    //                bodyA = box2DSystem.getFixturesAt(anchorA.get_x(), anchorA.get_y())[0].GetBody();
    //                        if (!bodyA) {
    //                            bodyA = box2DSystem.getGroundBody();
    //                        }
            }

            if (jointState.bodyB) {
                if (darlingutil.isString(jointState.bodyB)) {
                    bodyB = getBox2DBodyByEntityName($world, jointState.bodyB);
                } else {
                    bodyB = jointState.bodyB;
                }
            } else {
                bodyB = box2DSystem.getOneBodyAt(anchorB.get_x(), anchorB.get_y());
    //                bodyB = box2DSystem.getFixturesAt(anchorB.get_x(), anchorB.get_y())[0].GetBody();
    //                        if (!bodyB) {
    //                            bodyB = box2DSystem.getGroundBody();
    //                        }
            }

            if (!bodyA || !bodyB) {
                box2DSystem.requestFixturesBetween(anchorA, anchorB, function(fixture, point, normal, fraction) {
                    anchorA.set_x(point.get_x());
                    anchorA.set_y(point.get_y());
                    if (!bodyA) {
                        bodyA = fixture.GetBody();
                        if (!bodyB) {
                            bodyB = box2DSystem.getGroundBody();
                            lowerTranslation = distance * (fraction - 1);
                        }
                    } else {
                        bodyB = fixture.GetBody();
                    }

                    var distance = axis.Length();
                    upperTranslation = distance * fraction;
                    return false;
                });
            }

            var jointDef = new Box2D.b2PrismaticJointDef();
            jointDef.Initialize(bodyA, bodyB, anchorA, axis);
    //            jointDef.set_localAnchorA(bodyA.GetLocalPoint(anchorA));
    //            jointDef.set_localAnchorB(bodyB.GetLocalPoint(anchorB));

            jointDef.set_collideConnected(false);
            jointDef.set_lowerTranslation(jointState.lowerTranslation || lowerTranslation);
            jointDef.set_upperTranslation(jointState.upperTranslation || upperTranslation);
            jointDef.set_enableLimit(true);
            jointDef.set_maxMotorForce(jointState.maxMotorForce);
            jointDef.set_motorSpeed(jointState.motorSpeed);
            jointDef.set_enableMotor(jointState.enableMotor);
            //return;

            jointState._joint = box2DSystem.createJoint(jointDef, Box2D.b2PrismaticJoint);
            if (!$node.$has('ngAnyJoint')) {
                $node.$add('ngAnyJoint');
            }
            $node.ngAnyJoint.joint = jointState._joint;
        }]
    });

    m.$s('ngBox2DCollision', {
        $require: ['ngWantsToCollide', 'ngPhysic'],

        $addNode: ['$node', 'ngBox2DSystem', function($node, ngBox2DSystem) {
            if (this._listening) {
                return;
            }
            this._startListen(ngBox2DSystem);
        }],

        _listening: false,

        _startListen: function(ngBox2DSystem) {
            this._listening = true;
            var collisionCallback = new Box2D.b2ContactListener();

            Box2D.customizeVTable(collisionCallback, [{
                original: Box2D.b2ContactListener.prototype.BeginContact,
                replacement:
                    function(thsPtr, contactPtr) {
                        var contact = Box2D.wrapPointer( contactPtr, Box2D.b2Contact);
                        var entityA = getEntityA(contact);
                        var entityB = getEntityB(contact);
                        beginContact(entityA, entityB, contact);
                        beginContact(entityB, entityA, contact);
                    }
            }]);

            Box2D.customizeVTable(collisionCallback, [{
                original: Box2D.b2ContactListener.prototype.EndContact,
                replacement:
                    function(thsPtr, contactPtr) {
                        var contact = Box2D.wrapPointer( contactPtr, Box2D.b2Contact);
                        var entityA = getEntityA(contact);
                        var entityB = getEntityB(contact);
                        endContact(entityA, entityB, contact);
                        endContact(entityB, entityA, contact);
                    }
            }]);

//            Box2D.customizeVTable(collisionCallback, [{
//                original: Box2D.b2ContactListener.prototype.PreSolve,
//                replacement:
//                    function(contactPtr, oldManifold) {
//                        var contact = Box2D.wrapPointer( contactPtr, Box2D.b2Contact);
////                        console.log('PreSolve', contact, oldManifold);
//                    }
//            }]);

//            Box2D.customizeVTable(collisionCallback, [{
//                original: Box2D.b2ContactListener.prototype.PostSolve,
//                replacement:
//                    //impulse has type of b2ContactImpulse, so we need to update box2D for add this class
//                    function(contactPtr, impulse) {
//                        var contact = Box2D.wrapPointer( contactPtr, Box2D.b2Contact);
//                        var entityA = getEntityA(contact);
//                        var entityB = getEntityB(contact);
//                        console.log('PostSolve: ' + entityA + entityB);
//                    }
//            }]);

            ngBox2DSystem._world.SetContactListener(collisionCallback);
        }
    });

    function beginContact(entityA, entityB, collision) {
        var wants = entityA.ngWantsToCollide;
        if (entityA && wants) {
            var withObject = wants.with;
            if (darlingutil.isArray(withObject)) {
                for (var i = 0, count = withObject.length; i < count; i++) {
                    ruleContact(withObject[i], entityA, entityB, addContactComponent);
                }
            } else {
                ruleContact(withObject, entityA, entityB, addContactComponent);
            }
        }
    }

    function ruleContact(rule, entityA, entityB, handler) {
        var anyArray = rule.any;
        if (darlingutil.isArray(anyArray)) {
            for (var j = 0, countJ = anyArray.length; j < countJ; j++) {
                if (entityB.$has(anyArray[j])) {
                    handler(rule, entityA, entityB);
                }
            }
        } else {
            handler(rule, entityA, entityB);
        }
    }

    /**
     * Need little optimization - use list instead of array
     * @param rule
     * @param entityA
     * @param entityB
     */
    function addContactComponent(rule, entityA, entityB) {
        var component = entityA[rule.andGet];
        if (!component) {
            entityA.$add(rule.andGet, {
                'entities': [entityB]
            });
        } else {
            component.entities.push(entityB);
        }
        console.log(entityA.$name + ' get ' + rule.andGet + ' with ' + entityB.$name);
    }

    function removeContactComponent(rule, entityA, entityB) {
        var component = entityA[rule.andGet];
        var entities = component.entities;
        var index = entities.indexOf(entityB);
        entities.splice(index, 1);
        if (entities.length <= 0) {
            entityA.$remove(rule.andGet);
        }
        console.log(entityA.$name + ' lose ' + rule.andGet + ' with ' + entityB.$name);
    }

    function endContact(entityA, entityB, collision) {
        var wants = entityA.ngWantsToCollide;
        if (entityA && wants) {
            var withObject = wants.with;
            if (darlingutil.isArray(withObject)) {
                for (var i = 0, count = withObject.length; i < count; i++) {
                    ruleContact(withObject[i], entityA, entityB, removeContactComponent);
                }
            } else {
                ruleContact(withObject, entityA, entityB, removeContactComponent);
            }
        }
    }

    function getEntityA(contact) {
        return getEntity(contact.GetFixtureA());
    }

    function getEntityB(contact) {
        return getEntity(contact.GetFixtureB());
    }

    function getEntity(fixture) {
        if (!darlingutil.isDefined(fixture)) {
            return null;
        }

        var body = fixture.GetBody();
        if (body === null) {
            return null;
        }

        return body.m_userData;
    }

    /**
     * Linear transform of shape, use vertexes of Circle and Polygonal shape
     *
     * @param shape
     * @param dx
     * @param dy
     * @param rotation
     */
    function transformShape(shape, dx, dy, rotation) {
        var sin = Math.sin(rotation),
            cos = Math.cos(rotation),
            count = shape.GetVertexCount();

        for(var index = 0; index < count; index++) {
            var vec2 = shape.GetVertex(index);
            var x = vec2.get_x();
            var y = vec2.get_y();
            vec2.set_x( cos * x - sin * y + dx);
            vec2.set_y( sin * x + cos * y + dy);
        }
    }

    m.$s('ngBox2DCollisionGroup', {
        $require: ['ngCollisionGroup', 'ngPhysic'],

        _groupsListFirst: null,

        $addNode: function($node) {
            var ngPhysic = $node.ngPhysic;
            var fixture = ngPhysic._b2dFixture;

            if (darlingutil.isUndefined(fixture) || fixture === null) {
                return;
            }

            var ngCollisionGroup = $node.ngCollisionGroup,
                groupName,
                neverCollide,
                groupIndex;

            if (darlingutil.isDefined(ngCollisionGroup.neverWith) && ngCollisionGroup.neverWith !== null) {
                groupName = ngCollisionGroup.neverWith;
                neverCollide = true;
            }
            if (darlingutil.isDefined(ngCollisionGroup.alwaysWith) && ngCollisionGroup.alwaysWith !== null) {
                groupName = ngCollisionGroup.alwaysWith;
                neverCollide = false;
            }
            groupIndex = this._addGroupName(groupName);

            if (neverCollide) {
                groupIndex = -groupIndex;
            }

            fixture.GetFilterData().set_groupIndex(groupIndex);
        },

        _addGroupName: function(name) {
            var last = null;
            var node = this._groupsListFirst;
            var index = 1;
            while(node !== null) {
                if (node.name === name) {
                    return node.index;
                }
                index++;
                last = node;
                node = node.next;
            }

            node = {
                next: null,
                index: index,
                name: name
            };

            if (last) {
                last.next = node;
            } else {
                this._groupsListFirst = node;
            }

            return node.index;
        },

        $removeNode: function($node) {
            var ngCollisionGroup = $node.ngCollisionGroup;
            var ngPhysic = $node.ngPhysic;
//            TODO: remove groupIndex from and clear groupNode
        }
    });
})(darlingjs, darlingutil);