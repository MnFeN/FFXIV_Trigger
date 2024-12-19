using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Globalization;
using Triggernometry;
using static System.Math;
using static Triggernometry.Interpreter.StaticHelpers;
using static Triggernometry.PluginBridges.BridgeFFXIV;

RealPlugin.plug.RegisterNamedCallback(
    "U7a3_一运_Analyzer",
    new Action<object, string>(U7a3_一运_Analyzer.Callback),
    null,
    registrant: "绝伊甸警察"
);

public class U7a3_一运_Analyzer
{
    public static U7a3_一运_Analyzer Instance;
    public static void Callback(object _, string data)
    {
        var args = data.Split('\n')
            .Select(line => line.Split(new[] { '=' }, 2))
            .Where(parts => parts.Length == 2)
            .ToDictionary(
                parts => parts[0].Trim().ToLower(),
                parts => parts[1].Trim()
            );
        switch (args["command"].ToLower())
        {
            case "init": Instance = new U7a3_一运_Analyzer(); break;
            case "record": Instance.RecordData(args); break;
            case "parse": Instance.ParseAbility(args); break;
        }
    }

    /// <summary> 是否为国际服客户端，影响播报简繁体。 </summary>
    static bool IsGlobal;
    /// <summary> 按照 MT-D4 排序的八个玩家。 </summary>
    List<Player> Party;
    /// <summary> 按照绝对 Dir8 排序的八个玩家。 </summary>
    List<Player> PlayersByDir8;
    /// <summary> 按照绝对 Dir8 排序的八个沙漏 ID。 </summary>
    List<HourGlass> HourGlassesByDir8;

    Dictionary<string, Player> PlayersById;
    Dictionary<string, HourGlass> HourGlassesById;
    Dictionary<Debuff, Player> PlayersByDebuff = Enum.GetValues(typeof(Debuff)).Cast<Debuff>().ToDictionary(d => d, d => (Player)null);

    /// <summary> 连线的相对正北沙漏所处的绝对 Dir8。 </summary>
    int NorthDir8;

    /// <summary> 每次技能应判定到的 ID </summary>
    HashSet<string> Stack1, Stack2, Stack3, Stack4, Laser1, Laser2, Laser3;

    static void Command(string s) => RealPlugin.plug.InvokeNamedCallback("command", s); 

    enum AbilityEnum
    {
        黑暗神圣 = 0x9D55,
        初始激光 = 0x9D2B,
        旋转激光 = 0x9D64,
        黑暗狂水 = 0x9D4F,
        暗炎喷发 = 0x9D52,
        黑暗爆炎 = 0x9D54,
        黑暗冰封 = 0x9D57
    }

    static string Desc(AbilityEnum ability)
    {
        if (!IsGlobal) return ability.ToString();
        else switch (ability)
            {
                case AbilityEnum.黑暗神圣: return "黒暗神聖";
                case AbilityEnum.初始激光: return "初始激光";
                case AbilityEnum.旋转激光: return "旋轉激光";
                case AbilityEnum.黑暗狂水: return "黒暗狂水";
                case AbilityEnum.暗炎喷发: return "暗炎噴發";
                case AbilityEnum.黑暗爆炎: return "黒暗爆炎";
                case AbilityEnum.黑暗冰封: return "黒暗冰封";
                default: return ability.ToString();
            }
    }

    /// <summary> 沙漏连线后，根据触发器存储的变量初始化全部状态（除旋转方向）。 </summary>
    U7a3_一运_Analyzer()
    {
        IsGlobal = GetMyself().GetValue("name").ToString().Contains(" ");
        NorthDir8 = int.Parse(GetScalarVariable(false, "U7a3_一运_dir8"));
        var partyIdxToId = GetListVariable(false, "party").Values.Select(v => $"{v}").ToList();
        var partyIdxToDebuff = GetListVariable(false, "U7a3_一运_全队点名").Values
            .Select(v => (Debuff)int.Parse($"{v}"))
            .ToList();
        var 沙漏ByDir8 = GetDictVariable(false, "U7a3_一运_沙漏dir8").Values
            .OrderBy(v => $"{v.Value}") // 按 Dir8 排序
            .Select(v => $"{v.Key}") // 取 ID
            .ToList();

        List<Player> players = new List<Player>();
        List<HourGlass> hourGlasses = new List<HourGlass>();
        for (int idx = 0; idx < 8; idx++)
        {
            var playerID = partyIdxToId[idx];
            var debuff = partyIdxToDebuff[idx];
            var relDir8 = DebuffToRelDir8[debuff];
            var dir8 = (relDir8 + NorthDir8) % 8;
            var vdPlayer = GetIdEntity(playerID);
            var name = vdPlayer.GetValue("name").ToString();
            Player player = new Player
            {
                HexID = playerID,
                Dir8 = dir8,
                Debuff = debuff,
                Role = (RoleEnum)idx,
                Name = name,
                Job = vdPlayer.GetValue(IsGlobal ? "jobEN3" : "jobCN2").ToString()
            };
            HourGlass hourGlass = new HourGlass
            {
                Dir8 = dir8,
                HexID = 沙漏ByDir8[dir8],
                Speed = RelDir8ToSpeed[relDir8],
                Player = player,
            };
            player.HourGlass = hourGlass;
            players.Add(player);
            hourGlasses.Add(hourGlass);
            PlayersByDebuff[debuff] = player;
            PlayersById[playerID] = player;
            HourGlassesById[沙漏ByDir8[dir8]] = hourGlass;
        }
        PlayersByDebuff[Debuff.短或冰TH] = PlayersByDebuff[Debuff.短TH] ?? PlayersByDebuff[Debuff.冰TH];
        PlayersByDebuff[Debuff.长或冰D] = PlayersByDebuff[Debuff.长D] ?? PlayersByDebuff[Debuff.冰D];

        Party = players.OrderBy(p => p.Role).ToList();
        PlayersByDir8 = players.OrderBy(p => p.Dir8).ToList();
        HourGlassesByDir8 = hourGlasses.OrderBy(h => h.Dir8).ToList();

        Stack1 = new HashSet<string>(new Debuff[] { Debuff.冰TH, Debuff.中TH, Debuff.长高TH, Debuff.长低TH, Debuff.中D, Debuff.长或冰D }
            .Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
        Stack2 = new HashSet<string>(new Debuff[] { Debuff.短或冰TH, Debuff.长高TH, Debuff.长低TH, Debuff.短高D, Debuff.短低D, Debuff.长或冰D }
            .Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
        Stack3 = new HashSet<string>(new Debuff[] { Debuff.短或冰TH, Debuff.中TH, Debuff.短高D, Debuff.短低D, Debuff.中D, Debuff.冰D }.
            Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
        Stack4 = new HashSet<string>(new Debuff[] { Debuff.长高TH, Debuff.长低TH, Debuff.中D, Debuff.长或冰D }
            .Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
        Laser1 = new HashSet<string>(new Debuff[] { Debuff.长高TH, Debuff.长低TH, Debuff.长或冰D }
            .Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
        Laser2 = new HashSet<string>(new Debuff[] { Debuff.短或冰TH, Debuff.短高D, Debuff.短低D }
            .Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
        Laser3 = new HashSet<string>(new Debuff[] { Debuff.中TH, Debuff.中D }
            .Select(d => PlayersByDebuff[d]?.HexID).Where(id => id != null));
    }

    /// <summary> 技能的第几次释放。 </summary>
    Dictionary<AbilityEnum, int> AbilityCount = Enum.GetValues(typeof(AbilityEnum)).Cast<AbilityEnum>().ToDictionary(ability => ability, ability => 0);

    void ParseAbility(Dictionary<string, string> args)
    {
        var ability = (AbilityEnum)int.Parse(args["ability"], NumberStyles.HexNumber);
        AbilityCount[ability]++;

        var targetCount = int.Parse(args["count"]);
        if (targetCount == 0) return;

        var target = PlayersById[args["target"]];
        var others = Context.SplitArguments(args["others"]).Select(pid => PlayersById[pid]).ToList();
        List<Player> targets = new List<Player> { target }.Concat(others).ToList();

        string error;
        switch (ability)
        {
            case AbilityEnum.初始激光:
                return;
            case AbilityEnum.旋转激光:
                return;
            case AbilityEnum.黑暗冰封:
                {
                    var centerPlayerIds = Stack2;
                    var ice = PlayersByDebuff[Debuff.冰D] ?? PlayersByDebuff[Debuff.冰TH];
                    ice.UpdateDesc();
                    targets.ForEach(p => p.UpdateDesc());

                    error = $"【{Desc(ability)}】》 {targetCount} 人";
                    error += $"\n点名 {ice.TempDesc}";

                    error += targets.Count >= 3
                        ? $"\n　》 {string.Join("　", targets.Select(p => p.Role))}"
                        : $"\n　》 {string.Join("\n　》 ", targets.Select(p => p.TempDesc))}";

                    var targetsShouldClose = targets.Where(p => p.TempR >= 2 && centerPlayerIds.Contains(p.HexID));
                    var targetsShouldFar = targets.Where(p => p.TempR <= 12 && !centerPlayerIds.Contains(p.HexID));
                    error += $"\n 参考原因：";
                    if (targetsShouldClose.Count() > 0)
                        error += $"\n　　{string.Join("　", targetsShouldClose.Select(p => p.Role))} 分摊站位过远";
                    if (targetsShouldFar.Count() > 0)
                        error += $"\n　　{string.Join("　", targetsShouldFar.Select(p => p.Role))} 分散站位过近";
                }
                break;
            case AbilityEnum.黑暗神圣:
            case AbilityEnum.黑暗狂水:
                {
                    var turn = ability == AbilityEnum.黑暗狂水 ? 4 : AbilityCount[ability];
                    var correctTargets = new HashSet<string>[] { null, Stack1, Stack2, Stack3, Stack4 }[turn];
                    var extraPlayers = targets.Where(p => !correctTargets.Contains(p.HexID)).ToList();
                    var absentPlayers = correctTargets.Select(id => PlayersById[id]).Where(p => !targets.Contains(p)).ToList();
                    if (extraPlayers.Count == 0 && absentPlayers.Count == 0 || extraPlayers.Count == 0 && absentPlayers.Count == 1 && correctTargets.Count == 6) return;

                    targets.Concat(absentPlayers).ToList().ForEach(p => p.UpdateDesc());
                    error = $"【{Desc(ability)}】》 {targetCount} 人 （应有 {correctTargets.Count} 人）";
                    error += $"\n点名 {target.TempDesc}";
                    if (extraPlayers.Count > 0)
                        error += $"\n 多余：\n　》 {string.Join("\n　》 ", extraPlayers.Select(p => p.TempDesc))}";
                    if (absentPlayers.Count > 0)
                        error += absentPlayers.Count >= 3
                            ? $"\n　》 {string.Join("　", absentPlayers.Select(p => p.Role))}"
                            : $"\n　》 {string.Join("\n　》 ", absentPlayers.Select(p => p.TempDesc))}";

                    var extraPlayersClose = extraPlayers.Where(p => p.TempR <= 8);
                    var absentPlayersFar = absentPlayers.Where(p => p.TempR >= 3);
                    error += $"\n 参考原因：";
                    if (extraPlayersClose.Count() > 0)
                        error += $"\n　　{string.Join("　", extraPlayersClose.Select(p => p.Role))} 分散站位过近";
                    if (absentPlayersFar.Count() > 0)
                        error += $"\n　　{string.Join("　", absentPlayersFar.Select(p => p.Role))} 分摊站位过远";
                }
                break;
            case AbilityEnum.黑暗爆炎:
                {
                    var turn = PlayersByDebuff[Debuff.冰TH] == null
                        ? new int[] { 0, 1, 1, 1, 2, 2, 3, 3 }[AbilityCount[ability]]
                        : new int[] { 0, 1, 1, 2, 2, 3, 3, 3 }[AbilityCount[ability]];
                    var wrongTargets = new HashSet<string>[] { null, Stack1, Stack2, Stack3 }[turn];
                    if (targetCount == 1) return;

                    targets.ForEach(p => p.UpdateDesc());
                    string reason;
                    if (wrongTargets.Contains(target.HexID)) // 第一目标没有点名
                        reason = "乱点名";
                    else if (target.TempR < 12) // 点名者太近
                        reason = target.TempR > 6 ? $"{target.Role} 出慢了" : $"{target.Role} 未出人群";
                    else 
                    {
                        var furthestPerson = others.OrderByDescending(p => p.TempR).FirstOrDefault();
                        if (Abs(target.Tempθ) < PI / 10) // 点名者站位没错
                            reason = furthestPerson.TempR > 9.5 ? $"{furthestPerson.Role}方向错误" : furthestPerson.TempR > 3 ? $"{furthestPerson.Role}未贴近中心" : "情况复杂，无法判断";
                        else if (furthestPerson.TempR > 9.5)
                            reason = $"{target.Role}方向错误，误伤 {furthestPerson.Role}";
                        else
                            reason = $"{target.Role}方向错误、{furthestPerson.Role}站位错误";
                    }
                    error = $"【{Desc(ability)}】》 {targetCount} 人";
                    error += $"\n点名 {target.TempDesc}";
                    error += targetCount >= 4
                        ? $"\n　》 {string.Join("　", others.Select(p => p.Role))}"
                        : $"\n　》 {string.Join("\n　》 ", others.Select(p => p.TempDesc))}";
                    error += $"\n 参考原因：{reason}";
                }
                break;
            case AbilityEnum.暗炎喷发:
                {
                    var wrongTargets = Stack4;
                    if (targetCount == 1) return;

                    targets.ForEach(p => p.UpdateDesc());
                    string reason;
                    if (wrongTargets.Contains(target.HexID)) // 第一目标没有点名
                        reason = "乱点名";
                    else if (target.TempR < 8) // 点名者太近
                        reason = target.TempR > 6 ? $"{target.Role} 记录分散位置过近" : $"{target.Role} 未出人群记录分散";
                    else
                    {
                        var furthestPerson = others.OrderByDescending(p => p.TempR).FirstOrDefault();
                        if (Abs(target.Tempθ) < PI / 10) // 点名者站位没错
                            reason = furthestPerson.TempR > 8 ? $"{furthestPerson.Role}方向错误" : furthestPerson.TempR > 3 ? $"{furthestPerson.Role}未贴近中心" : "情况复杂，无法判断";
                        else if (furthestPerson.TempR > 8)
                            reason = $"{target.Role}方向错误，误伤 {furthestPerson.Role}";
                        else
                            reason = $"{target.Role}方向错误、{furthestPerson.Role}站位错误";
                    }
                    error = $"【{Desc(ability)}】》 {targetCount} 人";
                    error += $"\n点名 {target.TempDesc}";
                    if (targetCount >= 4)
                        error += $"\n　》 {string.Join("　", others.Select(p => p.Role))}";
                    else
                        error += $"\n　》 {string.Join("\n　》 ", others.Select(p => p.TempDesc))}";
                    error += $"\n 参考原因：{reason}";
                }
                break;
            default:
                throw new Exception("未处理的技能");
        }
        RecordError(ability, error);
    }

    void RecordData(Dictionary<string, string> args)
    {
        return;
    }

    List<string> Errors = new List<string>();
    Dictionary<AbilityEnum, int> ErrorCounts = Enum.GetValues(typeof(AbilityEnum)).Cast<AbilityEnum>().ToDictionary(ability => ability, ability => 0);
    void RecordError(AbilityEnum ability, string data)
    {
        ErrorCounts[ability]++;
        Errors.Add(data);
        if (ErrorCounts[ability] <= 3 && Errors.Count <= 5)
        {
            Command("/e \n" + data);
        }
    }

    class Player
    {
        public string HexID;
        public string Name;
        public string Job;
        public int Dir8;
        public Debuff Debuff;
        public HourGlass HourGlass;
        public RoleEnum Role;
        public double TempR, Tempθ;
        public string TempDesc;
        public string UpdateDesc()
        {
            //ＭＴ（战士）长高Ｔ　@ 6.5 m, 偏 +10°
            var rotatedPolarCoord = new PolarCoord(GetCurrentRelPos(HexID)).RotateTo(Dir8);
            TempR = rotatedPolarCoord.R;
            Tempθ = rotatedPolarCoord.θ;
            TempDesc = $"{Role}（{Job}）{U7a3_一运_Analyzer.Desc(Debuff, Role)}　@ {rotatedPolarCoord}";
            return TempDesc;
        }
    }

    class HourGlass
    {
        public string HexID;
        public int Dir8;
        public SpeedEnum Speed;
        public Player Player;
        public bool? _is顺;
        public bool Is顺
        {
            get
            {
                if (_is顺 == null) throw new Exception($"程序错误：沙漏 {HexID} (Dir8 = {Dir8}) 未记录旋转方向。");
                return _is顺.Value;
            }
        }
        public Vector2 RelPos
        {
            get 
            {
                var θ = (Dir8 - 4) * PI / 4;
                return 9.5f * new Vector2((float)Sin(θ), (float)Cos(θ));
            }
        }
    }
    
    static Vector2 GetCurrentRelPos(string hexId)
    {
        var player = GetIdEntity(hexId);
        var x = float.Parse(player.GetValue("x").ToString());
        var y = float.Parse(player.GetValue("y").ToString());
        return new Vector2(x - 100, y - 100);
    }

    public enum Debuff
    {
        短TH = 0, 冰TH = 1, 中TH = 2, 长高TH = 3, 长低TH = 4,
        短高D = 5, 短低D = 6, 中D = 7, 长D = 8, 冰D = 9,
        短或冰TH, 长或冰D,
    }

    public static string Desc(Debuff debuff, RoleEnum role)
    {
        bool isH = role == RoleEnum.Ｈ１ || role == RoleEnum.Ｈ２;
        var roleDesc = role.ToString().Substring(0, 1);
        var debuffDesc = debuff.ToString().TrimEnd('T', 'H', 'D');
        if (IsGlobal) debuffDesc = debuffDesc.Replace('长', '長');
        return (debuffDesc + roleDesc).PadRight(3, '　');
    }


    static Dictionary<Debuff, int> DebuffToRelDir8 = new Dictionary<Debuff, int>
    {
        { Debuff.短TH, 4 }, { Debuff.冰TH, 4 },
        { Debuff.中TH, 2 },
        { Debuff.长高TH, 3 }, { Debuff.长低TH, 5 },
        { Debuff.短高D, 1 }, { Debuff.短低D, 7 },
        { Debuff.中D, 6 },
        { Debuff.长D, 0 }, { Debuff.冰D, 0 },
    };

    public enum RoleEnum { ＭＴ = 0, ＳＴ = 1, Ｈ１ = 2, Ｈ２ = 3, Ｄ１ = 4, Ｄ２ = 5, Ｄ３ = 6, Ｄ４ = 7 }

    public enum SpeedEnum { 短, 中, 长 }
    static Dictionary<int, SpeedEnum> RelDir8ToSpeed = new Dictionary<int, SpeedEnum>
    {
        { 0, SpeedEnum.短 }, { 1, SpeedEnum.中 }, { 2, SpeedEnum.长 }, { 3, SpeedEnum.短 },
        { 4, SpeedEnum.中 }, { 5, SpeedEnum.短 }, { 6, SpeedEnum.长 }, { 7, SpeedEnum.中 },
    };
}

public class PolarCoord
{
    public double R;
    public double θ;
    public PolarCoord(double R, double θ)
    {
        this.R = R;
        this.θ = θ;
    }
    public PolarCoord(Vector2 vec)
    {
        R = Sqrt(vec.X * vec.X + vec.Y * vec.Y);
        θ = Atan2(vec.X, vec.Y);
    }

    public PolarCoord RotateTo(int dir8)
    {
        var newθ = θ - dir8 * PI / 4;
        return new PolarCoord(R, newθ);
    }

    public override string ToString()
    {
        var degree = θ / PI * 180;
        degree = (degree % 360 + 360) % 360;
        if (degree >= 180) degree -= 360;
        return $"{R:0.0} m, 偏 {(degree >= 0 ? "+" : "-")}{Abs(degree):0}°";
    }
}
