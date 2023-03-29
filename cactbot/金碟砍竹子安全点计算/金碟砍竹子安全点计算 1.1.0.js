/**
 * 金碟砍竹子安全点计算
 * @since 1.1.0, 2023-3-29
 * @author MnFeN
 * 
 * 【运行需求】
 * @requires cactbotself
 * 原 morelogline 插件，用于读取额外日志：https://github.com/tssailzz8/cacbotSelf
 * @requires PostNamazu
 * 鲶鱼精邮差，用于标点和产生提示音：https://github.com/Natsukage/PostNamazu
 * 
 * 【使用说明】
 * 将 js 文件置于 cactbot 设置的 user 目录中，重启 ACT 或刷新 cactbot 时间轴悬浮窗以正确加载。
 */

const logChannel = "cwl1"; 
const centerX = 70.5625;
const centerY = -35.9561;
const centerZ = -4.474;
const radius = 13.6;
const spotCount = 36;


function mod(a, b) {
  return ((a % b) + b) % b;
}

async function log(message) {
  callOverlayHandler({ call: "PostNamazu", c: "command", p: `/${logChannel} ${message}`});
}

function checkRay(bamboo, point) {
  // type = "9": 朝着面向正左方，宽度 5.4 m 的射线攻击 （为了站位容错，判定宽度改为 6 m）
  const distanceToLine = Math.abs(Math.sin(bamboo.Heading)*(point.x-bamboo.PosX) + Math.cos(bamboo.Heading)*(point.y-bamboo.PosY))
  const dotProduct = Math.cos(bamboo.Heading)*(point.x-bamboo.PosX) - Math.sin(bamboo.Heading)*(point.y-bamboo.PosY)
  return distanceToLine <= 3 && dotProduct > 0;
}

function checkLine(bamboo, point) {
  // type = "A": 垂直于面向，宽度 5.4 m 的直线攻击 （为了站位容错，判定宽度改为 6 m）
  const distanceToLine = Math.abs(Math.sin(bamboo.Heading)*(point.x-bamboo.PosX) + Math.cos(bamboo.Heading)*(point.y-bamboo.PosY))
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

async function initializeBamboo(data) {
  const myResult = await callOverlayHandler({
    call: 'getCombatants',
    names:[data.me],
  })
  data.self = myResult.combatants[0];
  data.spots = new Array(spotCount).fill(1);
}

async function processBamboo(data, decID, type) {
  console.log(decID, type);
  const bambooResult = await callOverlayHandler({
    call: 'getCombatants',
    ids:[decID],
  });
  const bamboo = bambooResult.combatants[0];
  bamboo.castType = type;
  getUnsafeSpots(bamboo, data);
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
      regex: /^.{15}\S+ 00:0:101:.{8}:0005:.{4}:1EAE9[9AB]:/,
      promise: async (data) => {
        await initializeBamboo(data);
      },
    },
    { //生成竹子时初始化所有点列表、自身 id
      id: 'Bamboo_Initialize_Test',
      suppressSeconds: 3,
      regex: /^.{15}\S+ 00:0038::bamboo/,
      promise: async (data) => {
        await initializeBamboo(data);
        await log(`self.ID = ${data.self.ID}`);
        await log(`spots = ${data.spots}`);
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
      regex: /^.{15}\S+ 00:0038::bamboo cast (?<type>[9AB])$/,
      promise: async (data, matches) => {	
        await processBamboo(data, data.self.ID, matches.type);
        await log(`spots = ${data.spots}`);
      },
    },
    {
      id: 'Bamboo_Mark',
      suppressSeconds: 3,
      delaySeconds: 3,
      regex: /^.{15}\S+ 00:0:101:.{8}:0005:.{4}:1EAE9[9AB]:/,
      promise: async (data, matches) => {	
        // 延迟三秒后获取自身位置，判断自身顺时针方向的点序号
        const result = await callOverlayHandler({
            call: 'getCombatants',
            names:[data.me],
        });
        const me = result.combatants[0];
        const myAngle = Math.atan2(me.PosX - centerX, me.PosY - centerY);
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

        const waymarks = {...CWWaymarks, ...CCWWaymarks};
        callOverlayHandler({call: "PostNamazu", c: "command", p: "/e <se.10>"});
        callOverlayHandler({call: "PostNamazu", c: "place", p: JSON.stringify(waymarks)});
      },
    },
  ],
});
