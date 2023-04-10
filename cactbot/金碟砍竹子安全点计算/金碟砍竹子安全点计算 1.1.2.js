/**
 * 金碟砍竹子安全点计算
 * @version 1.1.2
 * @date 2023-3-29
 * @author MnFeN
 * 
 * 运行需求：
 * @requires cactbotself
 *   原 morelogline 插件，用于读取额外日志：https://github.com/tssailzz8/cacbotSelf
 * @requires PostNamazu
 *   鲶鱼精邮差，用于标点和产生提示音：https://github.com/Natsukage/PostNamazu
 * 
 * 
 * 工作方式：
 *   触发器会读取场上竹子的位置与 AoE 类型，计算圆周的 36 个等分点有哪些安全；
 *   三秒后（上一次 AoE 判定结束）输出安全点，输出有以下两种方式：
 *   1. 场地标点：在场上标出顺/逆时针方向离角色最近的各 4 个安全点；
 *   2. 文本播报：用发送文本的方式，在聊天栏绘制全部点位是否安全的字符画图像。
 * 
 * 使用需知：
 *   1. 将 js 文件置于 cactbot 设置的 user 目录中，
 *      重启 ACT 或刷新 cactbot 时间轴悬浮窗以正确加载。
 *      （还不会的话自行查阅 cactbot 触发器安装教程）
 *   2. 找到下方开头的代码：const channel = "XXX";
 *      将 "XXX" 改为发送文本的频道，如默语 "e"、小队 "p"、部队 "fc"、通讯贝 "l1" "cwl1" 等。
 *      注意，如果你设置了默语以外的频道，意味着你希望频道内全员可以看见你的播报结果；
 *      如果留空（""），可关闭文本播报功能。
 * 
 * 测试（可选）：
 *   1. 在金碟砍竹子场地附近输入指令 "/e bamboo"：
 *      应听到提示音，并看到离你最近的 8 个标点。
 *      （此时没有模拟攻击，全部点安全，最近的安全点即为最近的等分点）。
 *   2. 9/A/B 代表竹子的三种攻击类型：
 *      9 代表朝自身面向左侧的射线；
 *      A 代表朝自身左右两侧的直线；
 *      B 代表自身位置为圆心的钢铁。
 *      此时输入指令如 "/e bamboo 9"，可用自身的坐标和面向代替竹子，模拟一次对应类型的 AoE，
 *      同样会有提示音、并标出顺逆各四个最近的安全点。
 *      请尝试改变自己的位置、面向、指令中的类型参数，观察标点是否正确。
 */

const channel = "cwl1"; //文本播报频道
const centerX = 70.5625;
const centerY = -35.9561;
const centerZ = -4.474;
const radius = 13.6;
const spotCount = 36;
const circleArray = [
  [-1, -1, -1, -1,  2,  1,  0, 35, 34, -1, -1, -1, -1],
  [-1, -1,  4,  3, -1, -1, -1, -1, -1, 33, 32, -1, -1],
  [-1,  5, -1, -1, -1, -1, -1, -1, -1, -1, -1, 31, -1],
  [-1,  6, -1, -1, -1, -1, -1, -1, -1, -1, -1, 30, -1],
  [ 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 29],
  [ 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 28],
  [ 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 27],
  [10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 26],
  [11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 25],
  [-1, 12, -1, -1, -1, -1, -1, -1, -1, -1, -1, 24, -1],
  [-1, 13, -1, -1, -1, -1, -1, -1, -1, -1, -1, 23, -1],
  [-1, -1, 14, 15, -1, -1, -1, -1, -1, 21, 22, -1, -1],
  [-1, -1, -1, -1, 16, 17, 18, 19, 20, -1, -1, -1, -1],
]

function mod(a, b) {
  return ((a % b) + b) % b;
}
async function log(message) {
  //callOverlayHandler({ call: "PostNamazu", c: "command", p: `/${channel} ${message}` });
  console.log(`[LOG] ${message}`);
}

async function getSelf(data) {
  const myResult = await callOverlayHandler({
    call: 'getCombatants',
    names: [data.me],
  });
  const me = myResult.combatants[0];
  return me;
}

function drawCircle(data) {
  let queue = [];
  circleArray.forEach(row => {
    let rowResult = "";
    row.forEach(index => {
      if (index === -1) {
        rowResult += '　 '; // 全角空格
      } else {
        rowResult += data.spots[index] === 1 ? '● ' : '◯ ';
      }
    });
    queue.push({ c: "command", p: `/${channel} ${rowResult}` });
  });
  callOverlayHandler({ call: "PostNamazu", c: "queue", p: JSON.stringify(queue) });
}

function checkRay(bamboo, point) {
  // type = "9": 朝着面向正左方，宽度 5.4 m 的射线攻击 （为了站位容错，判定宽度改为 6 m）
  const distanceToLine = Math.abs(Math.sin(bamboo.Heading) * (point.x - bamboo.PosX) + Math.cos(bamboo.Heading) * (point.y - bamboo.PosY))
  const dotProduct = Math.cos(bamboo.Heading) * (point.x - bamboo.PosX) - Math.sin(bamboo.Heading) * (point.y - bamboo.PosY)
  return distanceToLine <= 3 && dotProduct > 0;
}
function checkLine(bamboo, point) {
  // type = "A": 垂直于面向，宽度 5.4 m 的直线攻击 （为了站位容错，判定宽度改为 6 m）
  const distanceToLine = Math.abs(Math.sin(bamboo.Heading) * (point.x - bamboo.PosX) + Math.cos(bamboo.Heading) * (point.y - bamboo.PosY))
  return distanceToLine <= 3;
}
function checkCircle(bamboo, point) {
  // type = "B": 以自身为中心，半径 11 m 的圆形攻击
  const distanceSquared = Math.pow(point.x - bamboo.PosX, 2) + Math.pow(point.y - bamboo.PosY, 2);
  return distanceSquared <= Math.pow(11, 2);
}

function getPointByIndex(index) { //计算第 index 个点的坐标
  const angle = (2 * Math.PI / spotCount) * index;
  const point = {
    x: centerX - radius * Math.sin(angle),
    y: centerY - radius * Math.cos(angle),
  };
  return point;
}
function getUnsafeSpots(bamboo, data) { //根据给定竹子实体计算哪些点不安全
  const checkUnsafeFunc = {
    '9': checkRay,
    'A': checkLine,
    'B': checkCircle,
  }[bamboo.castType];

  for (let index = 0; index < spotCount; index++) {
    const point = getPointByIndex(index);
    const isUnsafe = checkUnsafeFunc(bamboo, point);
    // 如果对应点不安全，把 data.spots 列表中对应位置设置为 0，代表不安全
    if (isUnsafe) {
      data.spots[index] = 0;
    }
  }
}

function initializeBamboo(data) {
  data.spots = new Array(spotCount).fill(1);
}

async function processBamboo(data, decID, type) {
  const bambooResult = await callOverlayHandler({
    call: 'getCombatants',
    ids: [decID],
  });
  const bamboo = bambooResult.combatants[0];
  bamboo.castType = type;
  getUnsafeSpots(bamboo, data);
}

async function processSpots(data, matches) {
  // 获取自身位置，判断自身顺时针方向的点序号
  const me = await getSelf(data);
  const dX = me.PosX - centerX;
  const dY = me.PosY - centerY;
  const myAngle = (dX === 0 && dY === 0) ? me.Heading : Math.atan2(dX, dY);
  const myCWIndex = Math.floor((myAngle / Math.PI + 1) / 2 * spotCount);

  // 顺逆各取最近的四个安全点
  const CWSpotIndexes = [];
  const CCWSpotIndexes = [];
  let CWIndex = myCWIndex;
  let CCWIndex = mod(myCWIndex + 1, spotCount);
  while (CWSpotIndexes.length < 4) {
    if (data.spots[CWIndex] === 1) {
      CWSpotIndexes.push(CWIndex);
    }
    CWIndex = mod(CWIndex - 1, spotCount);
  }
  while (CCWSpotIndexes.length < 4) {
    if (data.spots[CCWIndex] === 1) {
      CCWSpotIndexes.push(CCWIndex);
    }
    CCWIndex = mod(CCWIndex + 1, spotCount);
  }

  const CWWaymarks = {};
  const CCWWaymarks = {};
  const CWLabels = ["A", "B", "C", "D"];
  const CCWLabels = ["One", "Two", "Three", "Four"];

  CWSpotIndexes.forEach((spotIndex, i) => {
    const point = getPointByIndex(spotIndex);
    CWWaymarks[CWLabels[i]] = {
      X: point.x,
      Y: centerZ,
      Z: point.y,
      Active: true,
    };
  });
  CCWSpotIndexes.forEach((spotIndex, i) => {
    const point = getPointByIndex(spotIndex);
    CCWWaymarks[CCWLabels[i]] = {
      X: point.x,
      Y: centerZ,
      Z: point.y,
      Active: true,
    };
  });

  const waymarks = { ...CWWaymarks, ...CCWWaymarks };
  await callOverlayHandler({ call: "PostNamazu", c: "command", p: "/e <se.10>" }); //发送提示音
  callOverlayHandler({ call: "PostNamazu", c: "place", p: JSON.stringify(waymarks) }); //发送标点
  drawCircle(data); //发送字符画文本播报
}

Options.Triggers.push({
  zoneId: 144,
  initData: () => {
    return {
      spots: new Array(spotCount).fill(1), // 代表正北开始逆时针 n 等分点方向是否安全
    };
  },
  triggers: [
    { //生成竹子时初始化所有点列表、自身 id
      id: 'Bamboo_Initialize',
      suppressSeconds: 3,
      regex: /^.{15}\S+ 00:0:101:.{8}:0005:.{4}:1EAE9[9AB]:|^.{15}\S+ 00:0038::bamboo/,
      promise: async (data) => {
        await initializeBamboo(data);
      },
    },
    { //生成竹子后计算这根竹子覆盖哪些点
      id: 'Bamboo_Cast',
      delaySeconds: 1, //等待初始化
      regex: /^.{15}\S+ 00:0:101:(?<ID>.{8}):0005:.{4}:1EAE9(?<type>[9AB]):/,
      promise: async (data, matches) => {
        await processBamboo(data, parseInt(matches.ID, 16), matches.type);
      },
    },
    {
      id: 'Bamboo_Cast_Test',
      delaySeconds: 1, //等待初始化
      regex: /^.{15}\S+ 00:0038::bamboo (?<type>[9AB])$/,
      promise: async (data, matches) => {
        const me = await getSelf(data);
        await processBamboo(data, me.ID, matches.type);
        await log(`spots = ${data.spots}`);
      },
    },
    {
      id: 'Bamboo_Mark',
      suppressSeconds: 3,
      delaySeconds: 3,
      regex: /^.{15}\S+ 00:0:101:.{8}:0005:.{4}:1EAE9[9AB]:|^.{15}\S+ 00:0038::bamboo/,
      promise: async (data, matches) => {
        await processSpots(data);
      },
    },
    {
      id: 'Bamboo_Evade_Dog',
      regex: /^.{15}\S+ 00:0:105:(?<ID>4.{7}):0005:00:00:00:70.56:-43.46:-4.49::/,
      promise: async (data, matches) => {
        const dogResult = await callOverlayHandler({
          call: 'getCombatants',
          ids: [parseInt(matches.ID, 16)],
        });
        const dog = dogResult.combatants[0];
        const offsetDistance = 1
        const dX = dog.PosX - centerX;
        const dY = dog.PosY - centerY;
        const distance = Math.sqrt(Math.pow(dX, 2) + Math.pow(dY, 2));
        if (distance < 8) {
          const unitVectorX = dX / distance;
          const unitVectorY = dY / distance;
          const safeX = centerX - (unitVectorX * offsetDistance);
          const safeY = centerY - (unitVectorY * offsetDistance);
          waymark = { A:{
            X: safeX,
            Y: centerZ,
            Z: safeY,
            Active: true,
          }}
          callOverlayHandler({ call: "PostNamazu", c: "place", p: JSON.stringify(waymarks) });
          callOverlayHandler({ call: "PostNamazu", c: "command", p: `/e <se.10>` });
        }
      },
    },
  ],
});

