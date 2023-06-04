/* global AFRAME */

if (typeof AFRAME === "undefined") {
  throw new Error(
    "Component attempted to register before AFRAME was available."
  );
}

/**
 * TARGET
 */
// all javascript code below is imported from aframe-shooter-kit index.js for easier editing
AFRAME.registerComponent("target", {
  schema: {
    active: { default: true },
  },

  init: function () {
    var el = this.el;
    el.addEventListener("object3dset", (evt) => {
      el.sceneEl.systems.bullet.registerTarget(this, this.data.static);
    });
  },

  update: function (oldData) {
    // `this.healthPoints` is current hit points with taken damage.
    // `this.data.healthPoints` is total hit points.
    this.healthPoints = this.data.healthPoints;
  },

  /**
   * Bullet Hit
   */
  onBulletHit: function (bullet) {
    if (!this.data.active) {
      return;
    }
    this.healthPoints -= bullet.damagePoints;
  },
});

/**
 * Bullet system for collision detection.
 */
AFRAME.registerSystem("bullet", {
  init: function () {
    var bulletContainer;
    bulletContainer = document.createElement("a-entity");
    bulletContainer.id = "superShooterBulletContainer";
    this.el.sceneEl.appendChild(bulletContainer);

    this.container = bulletContainer.object3D;
    this.pool = {};
    this.targets = [];
  },

  /**
   * Register and initialize bullet type.
   */
  registerBullet: function (bulletComponent) {
    var bullet;
    var bulletData;
    var i;
    var model;

    model = bulletComponent.el.object3D;
    if (!model) {
      return;
    }
    bulletData = bulletComponent.data;

    // Initialize pool and bullets.
    this.pool[bulletData.name] = [];
    for (i = 0; i < bulletData.poolSize; i++) {
      bullet = model.clone();
      bullet.damagePoints = bulletData.damagePoints;
      bullet.direction = new THREE.Vector3(0, 0, -1);
      bullet.maxTime = bulletData.maxTime * 1000;
      bullet.name = bulletData.name + i;
      bullet.speed = bulletData.speed;
      bullet.time = 0;
      bullet.visible = false;
      this.pool[bulletData.name].push(bullet);
    }
  },

  /**
   * Register single target.
   */
  registerTarget: function (targetComponent, isStatic) {
    var targetObj;
    this.targets.push(targetComponent.el);
    if (!isStatic) {
      return;
    }

    // Precalculate bounding box of bullet.
    targetObj = targetComponent.el.object3D;
    targetObj.boundingBox = new THREE.Box3().setFromObject(targetObj);
  },

  shoot: function (bulletName, gun) {
    var i;
    var oldest = 0;
    var oldestTime = 0;
    var pool = this.pool[bulletName];

    if (pool === undefined) {
      return null;
    }

    // Find available bullet and initialize it.
    for (i = 0; i < pool.length; i++) {
      if (pool[i].visible === false) {
        return this.shootBullet(pool[i], gun);
      } else if (pool[i].time > oldestTime) {
        oldest = i;
        oldestTime = pool[i].time;
      }
    }

    // All bullets are active, pool is full, grab oldest bullet.
    return this.shootBullet(pool[oldest], gun);
  },

  shootBullet: function (bullet, gun) {
    bullet.visible = true;
    bullet.time = 0;
    gun.getWorldPosition(bullet.position);
    gun.getWorldDirection(bullet.direction);
    bullet.direction.multiplyScalar(-bullet.speed);
    this.container.add(bullet);
    return bullet;
  },

  tick: (function () {
    var bulletBox = new THREE.Box3();
    var bulletTranslation = new THREE.Vector3();
    var targetBox = new THREE.Box3();

    return function (time, delta) {
      var bullet;
      var i;
      var isHit;
      var targetObj;
      var t;

      for (i = 0; i < this.container.children.length; i++) {
        bullet = this.container.children[i];
        if (!bullet.visible) {
          continue;
        }
        bullet.time += delta;
        if (bullet.time >= bullet.maxTime) {
          this.killBullet(bullet);
          continue;
        }
        bulletTranslation.copy(bullet.direction).multiplyScalar(delta / 850);
        bullet.position.add(bulletTranslation);

        // Check collisions.
        bulletBox.setFromObject(bullet);
        for (t = 0; t < this.targets.length; t++) {
          let target = this.targets[t];
          if (!target.getAttribute("target").active) {
            continue;
          }
          targetObj = target.object3D;
          if (!targetObj.visible) {
            continue;
          }
          isHit = false;
          if (targetObj.boundingBox) {
            isHit = targetObj.boundingBox.intersectsBox(bulletBox);
          } else {
            targetBox.setFromObject(targetObj);
            isHit = targetBox.intersectsBox(bulletBox);
          }
          if (isHit) {
            this.killBullet(bullet);
            target.components.target.onBulletHit(bullet);
            target.emit("hit", null);
            break;
          }
        }
      }
    };
  })(),

  killBullet: function (bullet) {
    bullet.visible = false;
  },
});

/**
 * Shooter. Entity that spawns bullets and handles bullet types.
 * e.g. Cleaned up as much as possible for now dont mess with this
 */
AFRAME.registerComponent("shooter", {
  schema: {
    activeBulletType: { type: "string", default: "normal" },
    bulletTypes: { type: "array", default: ["normal"] },
    cycle: { default: false },
  },
  init: function () {
    this.el.addEventListener("shoot", this.onShoot.bind(this));
    this.el.addEventListener("bullet", this.bullet.bind(this));
    this.bulletSystem = this.el.sceneEl.systems.bullet;
  },
  onShoot: function () {
    this.bulletSystem.shoot(this.data.activeBulletType, this.el.object3D);
  },
  bullet: function (evt) {
    // Direct set bullet type.
    el.setAttribute("shooter", "activeBulletType", evt.detail);
  },
});

AFRAME.registerComponent("score", {
  schema: {
    score: { type: "number", default: 0 },
  },
  init: function () {
    this.scoreState = this.data.score;
    this.scoreText = document.createElement("a-text");
    this.scoreText.setAttribute("color", "black");
    this.el.appendChild(this.scoreText);
    this.updateScoreDisplay();

    var hitHandler = this.el.sceneEl.querySelector("[hit-handler]");
    hitHandler.addEventListener("hit", () => {
      // this.scoreState += 100;
      this.updateScoreDisplay();
    });

    var leaderboard = this.el.sceneEl.querySelector("[leaderboard]");
    this.el.sceneEl.addEventListener("time-up", () => {
      leaderboard.components.leaderboard.updateLeaderboard(this.scoreState);
      this.scoreState = 0; // Reset the score to 0
      this.updateScoreDisplay();
    });
  },

  updateScoreDisplay: function () {
    this.scoreText.setAttribute("value", "Score: " + this.scoreState);
  },
});

//leaderboard
AFRAME.registerComponent("leaderboard", {
  init: function () {
    this.leaderboard = [];
    this.leaderboardText = document.createElement("a-text");
    this.leaderboardText.setAttribute("color", "black");
    this.el.appendChild(this.leaderboardText);
  },
  updateLeaderboard: function (score) {
    // Add the score to the leaderboard
    this.leaderboard.push(score);

    // Sort the leaderboard in descending order
    this.leaderboard.sort((a, b) => b - a);

    // Limit the leaderboard to the top 5 scores
    this.leaderboard = this.leaderboard.slice(0, 5);

    // Generate the leaderboard text
    var leaderboardText = "Leaderboard\n";
    for (var i = 0; i < this.leaderboard.length; i++) {
      leaderboardText += i + 1 + ". " + this.leaderboard[i] + "\n";
    }

    // Update the leaderboard text element
    this.leaderboardText.setAttribute("value", leaderboardText);
  },
});

/* solve quiz */

var korFont =
  "https://raw.githubusercontent.com/myso-kr/aframe-fonts-korean/master/fonts/ofl/nanumgothic/NanumGothic-Regular.json";

var questionsH = [
  "지금 너무 답답해H",
  "나 내일 면접 보러 가기로 했어H",
  "너한테 실망이야H",
];
var qanswerAH = ["담배 피우러 갈래?", "파이팅", "어의가 없네"];
var qanswerBH = ["담배 피러 갈래?", "화이팅", "어이가 없네"];
var correctAnswerH = [0, 0, 1];
var questionsM = [
  "지금 너무 답답해M",
  "나 내일 면접 보러 가기로 했어M",
  "너한테 실망이야M",
];
var qanswerAM = ["담배 피우러 갈래?", "파이팅", "어의가 없네"];
var qanswerBM = ["담배 피러 갈래?", "화이팅", "어이가 없네"];
var correctAnswerM = [0, 0, 1];
var questionsL = [
  "지금 너무 답답해L",
  "나 내일 면접 보러 가기로 했어L",
  "너한테 실망이야L",
];
var qanswerAL = ["담배 피우러 갈래?", "파이팅", "어의가 없네"];
var qanswerBL = ["담배 피러 갈래?", "화이팅", "어이가 없네"];
var correctAnswerL = [0, 0, 1];
var quizSize = 3;

AFRAME.registerComponent("quiz-screen", {
  schema: {
    quizIndex: { type: "number", default: 0 },
    quizCheck: { type: "number", default: 0 },
    ans: { type: "number", default: 0 },
    levelIndex: { type: "number", default: 0 },
    active: { default: true },
  },
  dependencies: ["material"],
  init: function () {
    var el = this.el;
    el.setAttribute("target", "");
    el.addEventListener("object3dset", (evt) => {
      el.sceneEl.systems.bullet.registerTarget(this, this.data.static);
    });
    // create a new content entity

    var buttonA = document.createElement("a-entity");
    var buttonB = document.createElement("a-entity");
    var question = document.createElement("a-text");
    var answerA = document.createElement("a-text");
    var answerB = document.createElement("a-text");
    var answerAText = document.createElement("a-text");
    var answerBText = document.createElement("a-text");
    var model = document.createElement("a-entity");

    var buttonH = document.createElement("a-entity");
    var buttonM = document.createElement("a-entity");
    var buttonL = document.createElement("a-entity");
    var buttonHText = document.createElement("a-text");
    var buttonMText = document.createElement("a-text");
    var buttonLText = document.createElement("a-text");

    // set the target attributes
    buttonA.setAttribute("target", "");
    buttonB.setAttribute("target", "");
    buttonA.setAttribute("hit-handler", "");
    buttonB.setAttribute("hit-handler", "");
    buttonA.classList.add("target");
    buttonB.classList.add("target");
    buttonA.setAttribute("target", "healthPoints: 1");
    buttonB.setAttribute("target", "healthPoints: 1");
    buttonA.setAttribute("geometry", {
      primitive: "box",
      width: 0.8,
      height: 0.5,
      depth: 0.5,
    });
    buttonB.setAttribute("geometry", {
      primitive: "box",
      width: 0.8,
      height: 0.5,
      depth: 0.5,
    });
    buttonA.setAttribute("visible", false);
    answerAText.setAttribute("visible", false);
    buttonB.setAttribute("visible", false);
    answerBText.setAttribute("visible", false);

    buttonH.setAttribute("target", "");
    buttonM.setAttribute("target", "");
    buttonL.setAttribute("target", "");
    buttonH.setAttribute("hit-handler", "");
    buttonM.setAttribute("hit-handler", "");
    buttonL.setAttribute("hit-handler", "");
    buttonH.classList.add("target");
    buttonM.classList.add("target");
    buttonL.classList.add("target");
    buttonH.setAttribute("target", "healthPoints: 1");
    buttonM.setAttribute("target", "healthPoints: 1");
    buttonL.setAttribute("target", "healthPoints: 1");
    buttonH.setAttribute("geometry", {
      primitive: "box",
      width: 0.9,
      height: 0.5,
      depth: 0.1,
    });
    buttonM.setAttribute("geometry", {
      primitive: "box",
      width: 0.9,
      height: 0.5,
      depth: 0.1,
    });
    buttonL.setAttribute("geometry", {
      primitive: "box",
      width: 0.9,
      height: 0.5,
      depth: 0.1,
    });

    // set the hit event

    //define the content
    this.answerA = answerA;
    this.answerB = answerB;
    this.question = question;
    this.model = model;

    // set the position
    buttonA.setAttribute("position", { x: -0.8, y: 0.3, z: -3 });
    buttonB.setAttribute("position", { x: 0.2, y: 0.3, z: -3 });
    question.setAttribute("position", { x: -1, y: 1.6, z: -3 });
    answerA.setAttribute("position", { x: -1, y: 1.3, z: -3 });
    answerB.setAttribute("position", { x: -1, y: 1.0, z: -3 });
    answerAText.setAttribute("position", { x: -0.8, y: 0.35, z: -2.75 });
    answerBText.setAttribute("position", { x: 0.2, y: 0.35, z: -2.75 });
    model.setAttribute("position", { x: 2, y: 0, z: -3 });
    buttonH.setAttribute("position", { x: 1, y: 0, z: -3 });
    buttonM.setAttribute("position", { x: 0, y: 0, z: -3 });
    buttonL.setAttribute("position", { x: -1, y: 0, z: -3 });
    buttonHText.setAttribute("position", { x: 1, y: 0, z: -2.9 });
    buttonMText.setAttribute("position", { x: 0, y: 0, z: -2.9 });
    buttonLText.setAttribute("position", { x: -1, y: 0, z: -2.9 });

    // set the buttonA
    buttonA.setAttribute("color", "#0080FF");

    // set the buttonB
    buttonB.setAttribute("color", "#0080FF");

    // set the question "Question: 아래 중 알맞은 것을 선택"
    // question.setAttribute("value", questionsH[this.data.quizIndex]);
    question.setAttribute("font", korFont);
    question.setAttribute("shader", "msdf");
    question.setAttribute("color", "#000000");
    question.setAttribute("width", "4");

    // set the answerA
    //answerA.setAttribute("value", qanswerA[this.data.quizIndex]);
    answerA.setAttribute("font", korFont);
    answerA.setAttribute("shader", "msdf");
    answerA.setAttribute("color", "#000000");
    answerA.setAttribute("width", "4");

    // set the answerB
    //answerB.setAttribute("value", qanswerB[this.data.quizIndex]);
    answerB.setAttribute("font", korFont);
    answerB.setAttribute("shader", "msdf");
    answerB.setAttribute("color", "#000000");
    answerB.setAttribute("width", "4");

    // set the answerAText
    answerAText.setAttribute("value", "A");
    answerAText.setAttribute("font", korFont);
    answerAText.setAttribute("shader", "msdf");
    answerAText.setAttribute("color", "#000000");
    answerAText.setAttribute("width", "4");
    answerAText.setAttribute("align", "center");

    // set the answerBText
    answerBText.setAttribute("value", "B");
    answerBText.setAttribute("font", korFont);
    answerBText.setAttribute("shader", "msdf");
    answerBText.setAttribute("color", "#000000");
    answerBText.setAttribute("width", "4");
    answerBText.setAttribute("align", "center");

    // set the buttonHText
    buttonHText.setAttribute("value", "Hard");
    buttonHText.setAttribute("font", korFont);
    buttonHText.setAttribute("shader", "msdf");
    buttonHText.setAttribute("color", "#000000");
    buttonHText.setAttribute("width", "4");
    buttonHText.setAttribute("align", "center");

    // set the buttonMText
    buttonMText.setAttribute("value", "Medium");
    buttonMText.setAttribute("font", korFont);
    buttonMText.setAttribute("shader", "msdf");
    buttonMText.setAttribute("color", "#000000");
    buttonMText.setAttribute("width", "4");
    buttonMText.setAttribute("align", "center");

    // set the buttonLText
    buttonLText.setAttribute("value", "Low");
    buttonLText.setAttribute("font", korFont);
    buttonLText.setAttribute("shader", "msdf");
    buttonLText.setAttribute("color", "#000000");
    buttonLText.setAttribute("width", "4");
    buttonLText.setAttribute("align", "center");

    // set the endModel(glft)
    model.setAttribute("gltf-model", "#myModel");

    // add the content to the scene
    this.el.sceneEl.appendChild(buttonA);
    this.el.sceneEl.appendChild(buttonB);
    this.el.sceneEl.appendChild(question);
    this.el.sceneEl.appendChild(answerA);
    this.el.sceneEl.appendChild(answerB);
    this.el.sceneEl.appendChild(answerAText);
    this.el.sceneEl.appendChild(answerBText);
    this.el.sceneEl.appendChild(buttonH);
    this.el.sceneEl.appendChild(buttonM);
    this.el.sceneEl.appendChild(buttonL);
    this.el.sceneEl.appendChild(buttonHText);
    this.el.sceneEl.appendChild(buttonMText);
    this.el.sceneEl.appendChild(buttonLText);

    // this.el.sceneEl.appendChild(model);

    //hit 판정 ??
    var updateScore = this.el.sceneEl.querySelector("[score]");
    var leaderboard = this.el.sceneEl.querySelector("[leaderboard]");
    buttonH.addEventListener("hit", () => {
      buttonA.setAttribute("visible", true);
      answerAText.setAttribute("visible", true);
      buttonB.setAttribute("visible", true);
      answerBText.setAttribute("visible", true);
      buttonH.setAttribute("visible", false);
      buttonM.setAttribute("visible", false);
      buttonL.setAttribute("visible", false);
      buttonHText.setAttribute("visible", false);
      buttonMText.setAttribute("visible", false);
      buttonLText.setAttribute("visible", false);
      levelIndex = 3;
      question.setAttribute("value", questionsH[this.data.quizIndex]);
      answerA.setAttribute("value", qanswerAH[this.data.quizIndex]);
      answerB.setAttribute("value", qanswerBH[this.data.quizIndex]);
      console.log("levelIndex", levelIndex);
    });
    buttonM.addEventListener("hit", () => {
      buttonA.setAttribute("visible", true);
      answerAText.setAttribute("visible", true);
      buttonB.setAttribute("visible", true);
      answerBText.setAttribute("visible", true);
      buttonH.setAttribute("visible", false);
      buttonM.setAttribute("visible", false);
      buttonL.setAttribute("visible", false);
      buttonHText.setAttribute("visible", false);
      buttonMText.setAttribute("visible", false);
      buttonLText.setAttribute("visible", false);
      levelIndex = 2;
      question.setAttribute("value", questionsM[this.data.quizIndex]);
      answerA.setAttribute("value", qanswerAM[this.data.quizIndex]);
      answerB.setAttribute("value", qanswerBM[this.data.quizIndex]);
      console.log("levelIndex", levelIndex);
    });
    buttonL.addEventListener("hit", () => {
      buttonA.setAttribute("visible", true);
      answerAText.setAttribute("visible", true);
      buttonB.setAttribute("visible", true);
      answerBText.setAttribute("visible", true);
      buttonH.setAttribute("visible", false);
      buttonM.setAttribute("visible", false);
      buttonL.setAttribute("visible", false);
      buttonHText.setAttribute("visible", false);
      buttonMText.setAttribute("visible", false);
      buttonLText.setAttribute("visible", false);
      levelIndex = 1;
      question.setAttribute("value", questionsL[this.data.quizIndex]);
      answerA.setAttribute("value", qanswerAL[this.data.quizIndex]);
      answerB.setAttribute("value", qanswerBL[this.data.quizIndex]);
      console.log("levelIndex", levelIndex);
    });

    buttonA.addEventListener("hit", () => {
      if (levelIndex == 1) {
        var answ = correctAnswerL[this.data.quizIndex];
      } else if (levelIndex == 2) {
        var answ = correctAnswerM[this.data.quizIndex];
      } else if (levelIndex == 3) {
        var answ = correctAnswerH[this.data.quizIndex];
      }
      if (answ == 0 && this.data.quizCheck == 0) {
        console.log("정답");
        updateScore.components.score.scoreState += 100;
        updateScore.components.score.updateScoreDisplay();
      } else {
        console.log("오답");
        leaderboard.components.leaderboard.updateLeaderboard(
          updateScore.components.score.scoreState
        );
        updateScore.components.score.scoreState = 0;
        updateScore.components.score.updateScoreDisplay();
        this.el.setAttribute("quiz-screen", "quizCheck", 1);
      }
      this.el.setAttribute("quiz-screen", "quizIndex", this.data.quizIndex + 1);
      if (this.data.quizIndex == quizSize) {
        this.el.setAttribute("quiz-screen", "quizCheck", 1);
        this.el.setAttribute("quiz-screen", "quizIndex", quizSize - 1);
      }
      if (levelIndex == 1) {
        question.setAttribute("value", questionsL[this.data.quizIndex]);
        answerA.setAttribute("value", qanswerAL[this.data.quizIndex]);
        answerB.setAttribute("value", qanswerBL[this.data.quizIndex]);
      } else if (levelIndex == 2) {
        question.setAttribute("value", questionsM[this.data.quizIndex]);
        answerA.setAttribute("value", qanswerAM[this.data.quizIndex]);
        answerB.setAttribute("value", qanswerBM[this.data.quizIndex]);
      } else if (levelIndex == 3) {
        question.setAttribute("value", questionsH[this.data.quizIndex]);
        answerA.setAttribute("value", qanswerAH[this.data.quizIndex]);
        answerB.setAttribute("value", qanswerBH[this.data.quizIndex]);
      }
    });

    buttonB.addEventListener("hit", () => {
      if (levelIndex == 1) {
        var answ = correctAnswerL[this.data.quizIndex];
      } else if (levelIndex == 2) {
        var answ = correctAnswerM[this.data.quizIndex];
      } else if (levelIndex == 3) {
        var answ = correctAnswerH[this.data.quizIndex];
      }
      if (answ == 1 && this.data.quizCheck == 0) {
        console.log("정답");
        updateScore.components.score.scoreState += 100;
        updateScore.components.score.updateScoreDisplay();
      } else {
        console.log("오답");
        leaderboard.components.leaderboard.updateLeaderboard(
          updateScore.components.score.scoreState
        );
        updateScore.components.score.scoreState = 0;
        updateScore.components.score.updateScoreDisplay();
        this.el.setAttribute("quiz-screen", "quizCheck", 1);
      }
      this.el.setAttribute("quiz-screen", "quizIndex", this.data.quizIndex + 1);
      if (this.data.quizIndex == quizSize) {
        this.el.setAttribute("quiz-screen", "quizCheck", 1);
        this.el.setAttribute("quiz-screen", "quizIndex", quizSize - 1);
      }
      if (levelIndex == 1) {
        question.setAttribute("value", questionsL[this.data.quizIndex]);
        answerA.setAttribute("value", qanswerAL[this.data.quizIndex]);
        answerB.setAttribute("value", qanswerBL[this.data.quizIndex]);
      } else if (levelIndex == 2) {
        question.setAttribute("value", questionsM[this.data.quizIndex]);
        answerA.setAttribute("value", qanswerAM[this.data.quizIndex]);
        answerB.setAttribute("value", qanswerBM[this.data.quizIndex]);
      } else if (levelIndex == 3) {
        question.setAttribute("value", questionsH[this.data.quizIndex]);
        answerA.setAttribute("value", qanswerAH[this.data.quizIndex]);
        answerB.setAttribute("value", qanswerBH[this.data.quizIndex]);
      }
    });
  },

  // if the quizIndex is changed, update the content
  update: function (oldData) {
    var el = this.el;
    var data = this.data;
    console.log("update");
    if (oldData.quizCheck !== data.quizCheck) {
      this.el.sceneEl.appendChild(this.model);
      console.log("quiz finished");
    }
    if (oldData.quizIndex !== data.quizIndex) {
      // console.log("quizIndex changed");
    }
  },
});
