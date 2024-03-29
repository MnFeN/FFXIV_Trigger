/**
 * 扫雷游戏
 * @version 1.1.0
 * @date 2023-4-28
 * @author MnFeN
 * @requires PostNamazu
 */

class Minesweeper {
    size = 8;
    mineCount = 10;
    currentMineCount = 10;
    endGame = false;
    useFlag = false;
    flags = [];
    icons = {
        0: "remove",
        1: "waymark 1",
        2: "waymark 2",
        3: "waymark 3",
        4: "waymark 4",
        5: "waymark A",
        6: "waymark B",
        7: "waymark C",
        8: "waymark D",
        flag: "marking circle",
        mine: "item 爆弹仔",
        grid: "general 任务指令1",
        error: "marking stop1",
    };
    neighbors = [
        [-1, -1],   [-1, 0],    [-1, 1],
        [0, -1],    [0, 1],
        [1, -1],    [1, 0],     [1, 1],
    ];
    debug () { // 调试台输出两个数组的当前状态
        console.log("game.mineMap:");
        for (let row of this.mineMap) { console.log(row) };
        console.log("game.state");
        for (let row of this.state) { console.log(row) };
    };
    countNeighbors(x, y) {
        let mineCount = 0;
        for (const [dx, dy] of this.neighbors) {
            const newX = x + dx;
            const newY = y + dy;
            if (newX < 0 || newX >= this.size || newY < 0 || newY >= this.size) {
                continue;
            }
            if (this.mineMap[newX][newY] == -1) {
                mineCount++;
            }
        }
        return mineCount;
    };
    resetMine() {
        // 0, 1, 2, ..., size^2-1 数组
        const indexes = Array(this.size * this.size).fill().map((_, i) => i);
        // Fisher-Yates Shuffle
        for (let pointer = 0; pointer < indexes.length - 1; pointer++) {
            const randIndex = Math.floor(Math.random() * (indexes.length - pointer)) + pointer;
            [indexes[pointer], indexes[randIndex]] = [indexes[randIndex], indexes[pointer]];
        }
        const selectedIndexes = indexes.slice(0, this.mineCount);
        // 将雷用 -1 存入 mineMap 数组
        this.mineMap = [...Array(this.size)].map(() => Array(this.size).fill(0));
        for (const index of selectedIndexes) {
            const x = Math.floor(index / this.size);
            const y = index % this.size;
            this.mineMap[x][y] = -1
        }
        // 计算周围地雷数
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                if (this.mineMap[x][y] !== -1) {
                    this.mineMap[x][y] = this.countNeighbors(x, y);
                }
            }
        }
    };
    async resetStatus () {
        // 存储格子是否翻开的数组（0: 未翻开; 1: 翻开; 2: 标记）
        this.state = [...Array(this.size)].map(() => Array(this.size).fill(0));
        // 初始化变量
        this.useFlag = false;
        this.endGame = false;
        this.currentMineCount = this.mineCount;
        this.flags = [];
        // 将预设的 1-10 hotbar 复制到当前栏位
        for (let hotbarIndex = 1; hotbarIndex <= 10; hotbarIndex++) {
            await callOverlayHandler({
                call: "PostNamazu",
                c: "command",
                p: `/hotbar copy GLA ${hotbarIndex} share ${hotbarIndex}`
            });
        }
        await this.showCurrentTool();
        await this.showMineCount();
    };
    async revealSingleCell(x, y) { // 仅显示单个格子的内容
        let icon;
        if (this.mineMap[x][y] == -1) {
            icon = this.icons.mine;
        }
        else if (this.mineMap[x][y] >= 0) {
            icon = this.icons[this.mineMap[x][y]];
        }
        await callOverlayHandler({
            call: "PostNamazu",
            c: "command",
            p: `/hotbar ${icon} ${x + 2} ${y + 2}`
        });
    };
    async revealCell(x, y) { // 点击翻开一个格子
        // 如果这个位置已被标记，跳过
        if (this.state[x][y] != 0) { return };

        // 标记翻开
        this.state[x][y] = 1;

        this.revealSingleCell(x, y);

        // 如果这个位置有地雷，显示地雷并结束
        if (this.mineMap[x][y] == -1) {
            this.lose();
        }
        // 如果这个位置为 0，递归周围格子
        else if (this.mineMap[x][y] == 0) {
            for (let [dx, dy] of this.neighbors) {
                let newX = x + dx;
                let newY = y + dy;
                if (newX >= 0 && newX < this.size && newY >= 0 && newY < this.size) {
                    await this.revealCell(newX, newY);
                }
            }
        }
    };
    async showCurrentTool() {
        if (this.useFlag) {
            await callOverlayHandler({ call: "PostNamazu", c: "command", p: `/hotbar ${this.icons.flag} 2 12` })
        } else {
            await callOverlayHandler({ call: "PostNamazu", c: "command", p: `/hotbar ${this.icons.grid} 2 12` })
        }
    };
    async showMineCount() {
        let remaining = this.currentMineCount;
        const mineCounts = Array(6).fill(0);
        for (let i = mineCounts.length - 1; i >= 0; i--) {
            let thisIndex = Math.min(remaining, 4);
            mineCounts[i] = thisIndex;
            remaining -= thisIndex;

            if (remaining == 0) { break };
        };

        for (let grid = 4; grid <= 9; grid++) {
            await callOverlayHandler({
                call: "PostNamazu",
                c: "command",
                p: `/hotbar ${this.icons[mineCounts[grid - 4]]} ${grid} 12`
            });
        };
    };
    async lose() {
        this.endGame = true;
        await callOverlayHandler({ call: "PostNamazu", c: "command", p: `/e <se.11>` });
        
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                if (this.state[x][y] == 0) { // 没有翻开或标记
                    this.revealSingleCell(x, y);
                }
                else if (this.state[x][y] == 2 && this.mineMap[x][y] != -1) { // 标记但不是雷
                    await callOverlayHandler({
                        call: "PostNamazu",
                        c: "command",
                        p: `/hotbar ${this.icons.error} ${x + 2} ${y + 2}`
                    });
                };
            };
        };
    };
    async win() {
        this.endGame = true;
        await callOverlayHandler({ call: "PostNamazu", c: "command", p: `/e <se.7>` });
    }
}

let game = new Minesweeper();

Options.Triggers.push({
    zoneId: ZoneId.MatchAll,
    initData: () => {
        return {
        }
    },
    triggers: [
        {   id: 'MineSweeper_Start', // 重新开局
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::minesweeper start/,
            promise: async () => {
                // 初始化地雷分布（-1: 雷; 0-8: 周围雷数）
                game.resetMine();
                await game.resetStatus();
                // game.debug();
            },
        },
        {   id: 'MineSweeper_Replay', // 重新开局 但不刷新地雷分布
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::minesweeper replay/,
            promise: async () => {
                await game.resetStatus();
            },
        },
        {   id: 'Minesweeper_RevealCell', // 点击翻开某个格子
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::minesweeper (?<x>\d+) (?<y>\d+)$/,
            condition: function() { return !game.useFlag && !game.endGame },
            promise: async (data, matches) => {
                const x = parseInt(matches.x) - 1;
                const y = parseInt(matches.y) - 1;
                await game.revealCell(x, y);
                // game.debug();
                if (!game.state.flat().includes(0) && !game.endGame ){
                    game.win();
                }
            },
        },
        {   id: 'Minesweeper_FlagCell', // 点击标记某个格子
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::minesweeper (?<x>\d+) (?<y>\d+)$/,
            condition: function() { return game.useFlag && !game.endGame },
            promise: async (data, matches) => {
                const x = parseInt(matches.x) - 1;
                const y = parseInt(matches.y) - 1;

                game.state[x][y] = 2;
                game.currentMineCount -= 1;
                game.flags.push([x, y]);

                await callOverlayHandler({ 
                    call: "PostNamazu", 
                    c: "command", 
                    p: `/hotbar ${game.icons.flag} ${x + 2} ${y + 2}` 
                });
                await game.showMineCount();
                if (!game.state.flat().includes(0) && !game.endGame && game.currentMineCount == 0 ) {
                    game.win();
                }
            },
        },
        {   id: 'Minesweeper_UndoFlagCell', // 取消上一次的标记
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::minesweeper undo$/,
            condition: function() { return game.currentMineCount < game.mineCount && !game.endGame },
            promise: async () => {
                game.currentMineCount += 1;
                let [x, y] = game.flags.pop();
                game.state[x][y] = 0;

                // 重置这一行
                await callOverlayHandler({ 
                    call: "PostNamazu", 
                    c: "command", 
                    p: `/hotbar copy GLA ${x + 2} share ${x + 2}` 
                });

                // 恢复剩余格子
                for (let i = 0; i <= 9; i++) {
                    if (game.state[x][i] == 1) {
                        await callOverlayHandler({ 
                            call: "PostNamazu", 
                            c: "command", 
                            p: `/hotbar ${game.icons[game.mineMap[x][i]]} ${x + 2} ${i + 2}` 
                        });
                    } else 
                    if (game.state[x][i] == 2) {
                        await callOverlayHandler({ 
                            call: "PostNamazu", 
                            c: "command", 
                            p: `/hotbar ${game.icons.flag} ${x + 2} ${i + 2}` 
                        });
                    }
                }
                // 恢复侧栏
                if (x == 1) {
                    await game.showCurrentTool();
                }
                await game.showMineCount();
            },
        },
        {   id: 'Minesweeper_UseFlag', // 启用/解除标记模式
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::minesweeper flag$/,
            promise: async () => {
                game.useFlag = !game.useFlag;
                game.showCurrentTool();
            },
        },
        {   id: 'Minesweeper_ChangeMineCount', // 设置地雷数
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038:: *minesweeper +count +(?<num>\d+) *$/,
            promise: async (data, matches) => {
                if (matches.num > 0 && matches.num <= 24) {
                    game.mineCount = matches.num;
                }
            },
        },
    ],
});
