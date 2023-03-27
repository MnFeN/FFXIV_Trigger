//尚未通过调试

// 场地中心 (70.5625, -49.6561)，安全点半径 13.6 m
const centerX = 70.5625;
const centerY = -35.9561;
const centerZ = -4.474;
const radius = 13.6;

function checkRay(bamboo, point) {
  // type = "9": 朝着面向正左方，宽度 5.3 m 的射线攻击
  const distanceToLine = Math.abs(Math.sin(bamboo.Heading)*(point.x-bamboo.PosX) + Math.cos(bamboo.Heading)*(point.y-bamboo.PosY))
  const dotProduct = Math.cos(bamboo.Heading)*(point.x-bamboo.PosX) - Math.sin(bamboo.Heading)*(point.y-bamboo.PosY)
  return distanceToLine <= 2.65 && dotProduct > 0;
}

function checkLine(bamboo, point) {
  // type = "A": 垂直于面向，宽度 5.3 m 的直线攻击
  const distanceToLine = Math.abs(Math.sin(bamboo.Heading)*(point.x-bamboo.PosX) + Math.cos(bamboo.Heading)*(point.y-bamboo.PosY))
  return distanceToLine <= 2.65;
}

function checkCircle(bamboo, point) {
  // type = "B": 以自身为中心，半径 11 m 的圆形攻击
  const distanceSquared = Math.pow(point.x - bamboo.PosX, 2) + Math.pow(point.y - bamboo.PosY, 2);
  return distanceSquared <= Math.pow(11, 2);
}

function getUnsafeSpots(bamboo, data) {
  const checkUnsafeFunc = {
    '9': checkRay,
    'A': checkLine,
    'B': checkCircle,
  }[bamboo.castType];

  for (let i = 0; i < 12; i++) {
    const angle = (2 * Math.PI / 12) * i;
    const point = {
      x: centerX - radius * Math.sin(angle),
      y: centerY - radius * Math.cos(angle),
    };

    const isUnsafe = checkUnsafeFunc(bamboo, point);
    callOverlayHandler({ call: "PostNamazu", c: "command", p: `/cwl1 type=${bamboo.castType}, i=${i}, unsafe=${isUnsafe}` });
    // 如果对应点不安全，把 data.spots 列表中对应位置设置为 0，代表不安全
    if (isUnsafe) {
      data.spots[i] = 0;
    }
  }
}

Options.Triggers.push({
  zoneId: 144,
  initData: () => {
    return {
      spots: new Array(12).fill(1), // 代表正北开始逆时针 12 个等分点方向是否安全
    };
  },
  triggers: [
    {
      id: 'Bamboo_Initialize',
      suppressSeconds: 3,
      regex: /^.{15}\S+ 00:0:101:.{8}:0005:.{4}:1EAE9[9AB]:|^.{15}\S+ 00:0038::bamboo init$/,
      run: (data) => {
        data.spots = new Array(12).fill(1);
        callOverlayHandler({ call: "PostNamazu", c: "command", p: "/cwl1 Bamboo_Initialize 初始化" });
      },
    },
    {
      id: 'Bamboo_Cast',
      delaySeconds: 1, //等待初始化
      regex: /^.{15}\S+ 00:0:101:(?<id>.{8}):0005:.{4}:1EAE9(?<type>[9AB]):/,
      promise: async (data, matches) => {	
        //获取本次触发的竹子实体信息，存入 bamboo
        const bambooResult = await callOverlayHandler({
            call: 'getCombatants',
            ids:[parseInt(matches.id, 16)],
        });
        const bamboo = bambooResult.combatants[0];
        bamboo.castType = matches.type;
        callOverlayHandler({ call: "PostNamazu", c: "command", p: `/cwl1 ${bamboo.castType} ${bamboo.PosX},${bamboo.PosY},${bamboo.Heading}`});
        // 根据这根竹子的伤害范围，将 data.spots 中的危险点设为 0
        getUnsafeSpots(bamboo, data);
      },
    },
    {
      id: 'Bamboo_Mark',
      suppressSeconds: 3,
      delaySeconds: 3,
      regex: /^.{15}\S+ 00:0:101:.{8}:0005:.{4}:1EAE9[9AB]:/,
      run: (data) => {
        //全部安全点的索引，0-11
        const safeSpotIndexes = data.spots
          .map((spot, i) => (spot === 1 ? i : -1))
          .filter(spot => spot !== -1);
        callOverlayHandler({ call: "PostNamazu", c: "command", p: `/cwl1 len: ${safeSpotIndexes.length}`});
        const selectedSpotIndexes = [];

        if (safeSpotIndexes.length <= 8) {
          selectedSpotIndexes.push(...safeSpotIndexes);
        } 
        else { //超过 8 个点时均匀标点
          const step = safeSpotIndexes.length / 8;
          for (let i = 0; i < 8; i++) {
              selectedSpotIndexes.push(safeSpotIndexes[Math.floor(i * step)]);
          }
        }
    
        const waymark = {};
        const labels = ["A", "B", "C", "D", "One", "Two", "Three", "Four"];
    
        selectedSpotIndexes.forEach((spotIndex, i) => {
          const angle = (2 * Math.PI / 12) * spotIndex;
          const point = {
            x: centerX - radius * Math.sin(angle),
            y: centerY - radius * Math.cos(angle),
          };
    
          waymark[labels[i]] = {
            X: point.x,
            Y: centerZ,
            Z: point.y,
            Active: true,
          };
        });

        // 如果标记数少于8个，清除剩余标记
        for (let i = selectedSpotIndexes.length; i < 8; i++) {
          waymark[labels[i]] = {};
        }

        callOverlayHandler({call: "PostNamazu", c: "place", p: JSON.stringify(waymark)});
      },
    },
  ],
});
