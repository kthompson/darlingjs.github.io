'use strict';
/**
 * Project: darlingjs (GameEngine).
 * Copyright (c) 2013, Eugene-Krevenets
 */

(function() {
    var m = darlingjs.module('physicsModule');
    m.$c('impulse', {
        impulse: {x: 0.0, y: 0.0}
    });

    /**
     * Impulse update system.
     * Use for apply impulse to the ball on every frame.
     * And reflect on the borders
     */
    m.$s('impulseUpdate', {
        width: 400,
        height: 300,

        $require: ['impulse', 'ng2D', 'ng2DSize'],

        $update: ['$entity', function($entity) {
            var ng2D = $entity.ng2D,
                ng2DSize = $entity.ng2DSize,
                impulse = $entity.impulse,
                halfWidth = 0.5 * ng2DSize.width,
                halfHeight = 0.5 * ng2DSize.height;

            ng2D.x += impulse.x;
            ng2D.y += impulse.y;

            //we don't need to check it because it's part of gameplay
            /*if (ng2D.x <= halfWidth) {
                ng2D.x = halfWidth;
                impulse.x = -impulse.x;
            } else if (ng2D.x > this.width - halfWidth) {
                ng2D.x = this.width - halfWidth;
                impulse.x = -impulse.x;
            }*/

            if (ng2D.y <= halfHeight) {
                ng2D.y = halfHeight;
                impulse.y = -impulse.y;
            } else if (ng2D.y > this.height - halfHeight) {
                ng2D.y = this.height - halfHeight;
                impulse.y = -impulse.y;
            }
        }]
    });

    m.$c('solid');

    /**
     * PongCollision system use for catch collision of ball and paddle
     * and reflect impulse of ball.
     *
     */
    m.$s('pongCollision', {
        edgePart: 0.2,

        paddles: null,
        balls: null,

        $require: ['solid', 'ng2D', 'ng2DSize'],

        $added: function() {
            this.paddles = new darlingutil.List('paddles');
            this.balls = new darlingutil.List('balls');
        },

        $addEntity: function($entity) {
            var solid = $entity.solid;
            if (solid.type === 'ball') {
                this.balls.add($entity);
            } else if (solid.type === 'left-paddle') {
                solid.left = true;
                this.paddles.add($entity);
            } else if (solid.type === 'right-paddle') {
                solid.left = false;
                this.paddles.add($entity);
            } else {
                throw new Error('solid type ' + solid.type + ' undefined');
            }
        },

        $removeEntity: function($entity) {
            var solid = $entity.solid;
            if (solid.type === 'ball') {
                this.balls.remove($entity);
            } else if (solid.type === 'paddle') {
                this.paddles.remove($entity);
            } else {
                throw new Error('solid type ' + solid.type + ' undefined');
            }
        },

        $update: function() {
            var ballNode = this.balls.$head;
            while(ballNode) {
                var ballEntity = ballNode.instance;
                var paddleNode = this.paddles.$head;
                while(paddleNode) {
                    var paddleEntity = paddleNode.instance;
                    if (this.checkCollision(ballEntity, paddleEntity)) {
                        //define which part of paddle hit the ball (middle or edge) and change angle on a edge
                        //    O
                        //       _______
                        //      / |   | \
                        //      \_|___|_/
                        //
                        //reflection
                        var ballNg2D = ballEntity.ng2D,
                            ballNg2DSize = ballEntity.ng2DSize,
                            paddleEntityNg2D = paddleEntity.ng2D,
                            paddleEntityNg2DSize = paddleEntity.ng2DSize,
                            ballImpulse = ballEntity.impulse;

                        var delta = (ballNg2D.y - paddleEntityNg2D.y) / paddleEntityNg2DSize.height;
                        var slope = Math.PI / 16;
                        if (delta < -this.edgePart) {
                            //top edge
                            this.calcSlopImpulse(ballImpulse, paddleEntity.solid.left?-slope:Math.PI + slope);
                        } else if (delta > this.edgePart) {
                            //bottom edge
                            this.calcSlopImpulse(ballImpulse, paddleEntity.solid.left?slope:Math.PI - slope);
                        } else {
                            //middle
                            ballImpulse.x = -ballImpulse.x;
                        }

                        //apply paddle impulse
                        if (paddleEntity.moveDown) {
                            ballImpulse.y += 0.2 * paddleEntity.moveDown.speed;
                        } else if (paddleEntity.moveUp) {
                            ballImpulse.y -= 0.2 * paddleEntity.moveUp.speed;
                        }

                        //bring ball outside the paddle. to avoid side effects
                        if (paddleEntity.solid.left) {
                            ballEntity.ng2D.x = paddleEntity.ng2D.x + (paddleEntity.ng2DSize.width + ballEntity.ng2DSize.width) / 2;
                        } else {
                            ballEntity.ng2D.x = paddleEntity.ng2D.x - (paddleEntity.ng2DSize.width + ballEntity.ng2DSize.width) / 2;
                        }
                    }
                    paddleNode = paddleNode.$next;
                }
                ballNode = ballNode.$next;
            }
        },

        calcSlopImpulse: function(ballImpulse, normalAngle) {
            var impulseScale = Math.sqrt(ballImpulse.x * ballImpulse.x + ballImpulse.y * ballImpulse.y),
                impulseAngle = Math.atan2(-ballImpulse.y, -ballImpulse.x);

            impulseAngle = 2 * normalAngle - impulseAngle;

            ballImpulse.x = impulseScale * Math.cos(impulseAngle);
            ballImpulse.y = impulseScale * Math.sin(impulseAngle);
        },

        checkCollision: function(entity1, entity2) {
            if (entity1 === entity2) {
                return;
            }
            var ng2D1 = entity1.ng2D,
                ng2DSize1 = entity1.ng2DSize,
                halfWidth1 = 0.5 * ng2DSize1.width,
                halfHeight1 = 0.5 * ng2DSize1.height,
                ng2D2 = entity2.ng2D,
                ng2DSize2 = entity2.ng2DSize,
                halfWidth2 = 0.5 * ng2DSize2.width,
                halfHeight2 = 0.5 * ng2DSize2.height;

            return this.rectOverlap(
                ng2D1.x - halfWidth1, ng2D1.x + halfWidth1,
                ng2D1.y - halfHeight1, ng2D1.y + halfHeight1,
                ng2D2.x - halfWidth2, ng2D2.x + halfWidth2,
                ng2D2.y - halfHeight2, ng2D2.y + halfHeight2
            );
        },

        sign: function(value) {
            if (value > 0) {
                return 1;
            } else if (value < 0) {
                return -1;
            } else {
                return 0;
            }
        },

        rectOverlap: function(left1, right1, top1, bottom1, left2, right2, top2, bottom2) {
            return (left1 < right2 && left2 < right1 && top1 < bottom2 && top2 < bottom1);
        }
    });
})();