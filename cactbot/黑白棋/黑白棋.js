/**
 * 黑白棋
 * @version 1.0.0
 * @date 2023-5-7
 * @author MnFeN
 * @requires PostNamazu
 */

class Reversi {
    constructor() {
        this.useAI = {black: false, white: false};
    };

    icons = {
        black: "item 暗黑骑士之证",
        white: "item 骑士之证",
        blank: "remove",
        0: "remove",
        1: "waymark 1", 
        2: "waymark 2", 
        3: "waymark 3", 
        4: "waymark 4", 
        5: "waymark A", 
        6: "waymark B", 
        7: "waymark C", 
        8: "waymark D",
    };

    initCells = [ //[x, y, color]
        [3, 3, -1],
        [3, 4, 1],
        [4, 3, 1],
        [4, 4, -1]
    ];

    directions = [
        [-1, -1],   [-1, 0],    [-1, 1],
        [0, -1],                [0, 1],
        [1, -1],    [1, 0],     [1, 1]
    ];

    async command(commandText) {
        await callOverlayHandler({ 
            call: "PostNamazu", 
            c: "command", 
            p: `/${commandText}`,
        });
    };

    async debug () { // 调试台输出数组的当前状态
        let boardStateStr = "\n┏ ━ ━ ━ ━ ━ ━ ━ ━ ┓";
        for (let row of this.board) {
            boardStateStr += "\n┃";
            for (let cell of row) {
                let char = {"-1": "○", "0": "　", "1": "●"}[cell];
                boardStateStr += ` ${char}`;
            }
            boardStateStr += " ┃";
        };
        boardStateStr += "\n┗ ━ ━ ━ ━ ━ ━ ━ ━ ┛";
        boardStateStr += `\n比分：黑 ${this.score[0]} / 白 ${this.score[1]}`;
        boardStateStr += `\n这一手棋为：${this.currentColor == 1 ? "黑" : "白"}`;
        await this.command(`cwl1 ${boardStateStr}`);
    };

    async setSingleCell(x, y, color) {
        this.board[x][y] = color;
        // console.log(`this.board[${x}][${y}] = ${this.board[x][y]}`)
        const icon = this.icons[color == 1 ? "black" : "white"];
        await this.command(`hotbar ${icon} ${x + 2} ${y + 2}`);
    };

    async setCurrentPlayerIcon() {
        const icon = this.currentColor == 1 ? this.icons.black : this.icons.white; 
        await this.command(`hotbar ${icon} 1 1`);
        await this.command(`hotbar ${icon} 1 10`);
        await this.command(`hotbar ${icon} 10 1`);
        await this.command(`hotbar ${icon} 10 10`);
    };

    async reset() {
        this.currentColor = 1;
        this.records = [];
        this.board = [...Array(8)].map(() => Array(8).fill(0));
        for (let i = 1; i <= 10; i++) {
            await this.command(`hotbar copy GLA ${i} share ${i}`);
        }
        for (const [x, y, color] of this.initCells) {
            await this.setSingleCell(x, y, color);
        }
    };

    countEachDirection(x, y, turnColor) { // 对于给定位置，计算当前回合颜色在八个方向可以反转的棋子数
        if (this.board[x][y] != 0) { // 已经有棋子
            return { sum: 0, counts: Array(8).fill(0) };
        }
        let adjacentOpponentCounts = [];
        for (let i = 0; i < this.directions.length; i++) {
            let [newX, newY] = [x, y];
            let [dx, dy] = this.directions[i];
            let adjacentOpponentCount = 0;
            let ended = 0;
            while (true) {
                newX += dx;
                newY += dy;
                if (newX < 0 || newX >= 8 || newY < 0 || newY >= 8) { break };
                let cellColor = this.board[newX][newY];
                // 空白格子：跳出循环；同色格子：标记结束并跳出；否则计数 + 1
                if (cellColor == 0) { break };
                if (cellColor == turnColor) { 
                    ended = 1;
                    break;
                };
                adjacentOpponentCount += 1;
            };
            if (!ended) { adjacentOpponentCount = 0 };
            adjacentOpponentCounts.push(adjacentOpponentCount);
        };
        const sum = adjacentOpponentCounts.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
        return { sum: sum, counts: adjacentOpponentCounts };
    };

    maxFlipCount (color) {
        // 8*8 列表
        let maxFlipCounts = [...Array(8)].map(() => Array(8).fill(0));
        let max = 0;
        let [maxX, maxY] = [-1, -1];
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                let result = this.countEachDirection(i, j, color);
                maxFlipCounts[i][j] = result;
                if (result.sum > max) {
                    max = result.sum;
                    [maxX, maxY] = [i, j];
                }
                // console.log(`${i}, ${j} (${color}): ${result.sum}`)
            };
        };
        return {
            max: max, 
            maxPos: [maxX, maxY],
            counts: maxFlipCounts
        };
    };

    async flipOpponentPieces(x, y, counts) {
        // 悔棋用的记录
        let record = {
            color: this.currentColor,
            current: [x, y],
            flip: [],
        };

        this.setSingleCell(x, y, this.currentColor);
        // 给定落子位置和八个方向应该翻转的棋数，翻转相应的棋
        for (let i = 0; i < counts.length; i++) {
            let [newX, newY] = [x, y];
            let [dx, dy] = this.directions[i];
            for (let j = 0; j < counts[i]; j++) {
                newX += dx;
                newY += dy;
                await this.setSingleCell(newX, newY, this.currentColor);
                record.flip.push([newX, newY]);
            };
        };
        this.records.push(record);
    };

    async playTurn() { // 每步均调用这个函数
        // 刷新侧栏
        await this.setScore();
        await this.setCurrentPlayerIcon();
        // 检测游戏是否结束（是否还有可以落子的位置）
        const maxFlipCount = this.maxFlipCount(this.currentColor);
        if (maxFlipCount.max == 0) {
            await this.endGame();
        } else {
            this.flipMap = maxFlipCount;            
            // 判断等待用户下棋还是调用 AI 下棋
            if (this.useAI[this.currentColor == 1 ? "black" : "white"] == true) {
                await this.aiMove();
            };
        };
    };

    async playerMove(x, y) {
        let result = this.flipMap.counts[x][y];
        if (!result.sum) {
            await this.command(`e <se.11>`);
        } else {
            await this.flipOpponentPieces(x, y, result.counts);
            this.currentColor *= -1;
            await game.playTurn();
        };
    };

    async aiMove() {
        // 延迟一秒
        await new Promise(resolve => setTimeout(resolve, 0));
        // 先写个简单的：查找这一步可以反转最多棋子的位置
        const selectedPos = this.flipMap.maxPos;
        const selectedCounts = this.flipMap.counts[selectedPos[0]][selectedPos[1]].counts;
        await this.flipOpponentPieces(...selectedPos, selectedCounts);
        // setTimeout 避免递归调用 playTurn
        this.currentColor *= -1;
        setTimeout(() => this.playTurn(), 0);
    };

    async undo() {
        if (this.records && this.records.length > 0) {
            const lastRecord = this.records.pop();
            // 复原落子位置
            let [x, y] = lastRecord.current;
            this.board[x][y] = 0;
            await this.command(`hotbar copy GLA ${x + 2} share ${x + 2}`);
            for (let i = 0; i < 8; i++) {
                if (this.board[x][i] != 0) {
                    const icon = this.icons[this.board[x][i] == 1 ? "black" : "white"];
                    await this.command(`hotbar ${icon} ${x + 2} ${i + 2}`);
                }
            }
            // 逐个翻转其余棋子
            for (let [x, y] of lastRecord.flip) {
                this.setSingleCell(x, y, lastRecord.color * -1);
            } 

            this.currentColor *= -1;
            await this.setScore();
            await this.setCurrentPlayerIcon();
        }
        else {
            await this.command(`e <se.11>`);
        }
    }

    hexToBijectiveOct(hexInt) {
        // 将 0-64 的分数转化为双射八进制，并用 0 补全到 2 位
        // 00 01 02 ... 07 08 11 12 ... 17 18 21 22 ... 87 88
        const a_0 = hexInt == 0 ? 0 : (hexInt - 1) % 8 + 1;
        const a_1 = (hexInt - a_0) / 8;
        return [a_1, a_0];
    };

    async setScore() {
        this.score = [0, 0];
        this.board.forEach(row => {
            row.forEach(cell => {
                if (cell == 1) { this.score[0] += 1 }
                else if (cell == -1) { this.score[1] += 1 };
            });
        });
        let scoreDigits = [...this.hexToBijectiveOct(this.score[0]), ...this.hexToBijectiveOct(this.score[1])];
        await this.command(`hotbar ${this.icons[scoreDigits[0]]} 2 12`);
        await this.command(`hotbar ${this.icons[scoreDigits[1]]} 3 12`);
        await this.command(`hotbar ${this.icons[scoreDigits[2]]} 8 12`);
        await this.command(`hotbar ${this.icons[scoreDigits[3]]} 9 12`);
    };

    async endGame() {
        await this.command(`e <se.7>`);
        const cells = [
            [2,11], [3,11], [4,11], [5,11], [6,11], [7,11], [8,11], [9,11]
        ]
        if (this.score[0] != this.score[1]) {
            const winnerIcon = this.score[0] > this.score[1] ? this.icons.black : this.icons.white;
            for (let cell of cells) {
                await this.command(`hotbar ${winnerIcon} ${cell[0]} ${cell[1]}`);
            }
        } else {
            let colorIcons = [this.icons.black, this.icons.white];
            index = 1;
            for (let cell of cells) {
                await this.command(`hotbar ${colorIcons[index]} ${cell[0]} ${cell[1]}`);
                index = 1 - index;
            }

        }
    };
}

let game = new Reversi();

Options.Triggers.push({
    zoneId: ZoneId.MatchAll,
    initData: () => {
        return {
        }
    },
    triggers: [
        {   id: 'Reversi_SelectGame',
            suppressSeconds: 0,
            regex: /^.{15}\S+ 00:0038::game select reversi$/,
            promise: async (data) => {
                data.currentMiniGame = 'reversi';
            },
        }, 
        {   id: 'Reversi_Start',
            suppressSeconds: 0.5,
            regex: /^.{15}\S+ 00:0038::game restart$/,
            condition: (data) => { return data.currentMiniGame == 'reversi' },
            promise: async () => {
                await game.reset();
                await game.playTurn();
            },
        }, 
        {   id: 'Reversi_PlayerMove',
            suppressSeconds: 0.2,
            regex: /^.{15}\S+ 00:0038::game (?<x>\d+) (?<y>\d+)$/,
            condition: (data) => { return data.currentMiniGame == 'reversi' },
            promise: async (_, matches) => {
                const [x, y] = [parseInt(matches.x) - 1, parseInt(matches.y) - 1];
                await game.playerMove(x, y);
            },
        }, 
        {   id: 'Reversi_SwitchAI',
            suppressSeconds: 0.5,
            regex: /^.{15}\S+ 00:0038::game useAI (?<color>black|white) (?<useAI>on|off)$/,
            condition: (data) => { return data.currentMiniGame == 'reversi' },
            promise: async (_, matches) => {
                game.useAI[matches.color] = (matches.useAI == "on" ? true : false);
                if (game.currentColor == (matches.color == "black" ? 1 : -1) && matches.useAI == "on") {
                    await game.aiMove();
                };
            },
        }, 
        {   id: 'Reversi_Undo',
            suppressSeconds: 0.5,
            regex: /^.{15}\S+ 00:0038::game undo$/,
            condition: (data) => { return data.currentMiniGame == 'reversi' },
            promise: async () => {
                await game.undo();

                // 切换颜色后若轮到 AI，再悔棋一步
                const currentUseAI = game.useAI[game.currentColor == 1 ? "black" : "white"];
                const opponentUseAI = game.useAI[game.currentColor == -1 ? "black" : "white"];
                if (currentUseAI && !opponentUseAI) {
                    await game.undo();
                } 

                await game.playTurn();

            },
        }, 
        {   id: 'Reversi_Debug',
            suppressSeconds: 0.2,
            regex: /^.{15}\S+ 00:0038::game debug$/,
            condition: (data) => { return data.currentMiniGame == 'reversi' },
            promise: async () => {
                await game.debug();
            },
        }, 
    ],
});
