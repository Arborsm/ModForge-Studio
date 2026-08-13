# Stardew Valley 游戏代码与资源搜索

查询本地已安装/解包的《Stardew Valley》游戏代码和资源，以验证字段语义、贴图布局、动画逻辑、数据格式等。结果可用于对 ModForge 的解析、渲染或编辑器行为做出判断。

## 可用资源

### 目录

- 游戏安装目录：`E:\SteamLibrary\steamapps\common\Stardew Valley`
- 已解包内容目录（如果存在）：`E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)`
  - `Data\*.json`：原版数据资产，如 `Characters.json`、`Objects.json`、`Buildings.json` 等
  - `Characters\*.png`：原版 NPC/怪物行走图 sprite sheet
  - `Portraits\*.png`：原版 NPC 肖像
  - `Maps\*.png/.tmx/.tbin`：地图贴图与地图文件
  - `TileSheets\*.png`：物件、建筑等图集
  - `Strings\*.json`：本地化字符串表
- 游戏主 DLL：`E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll`
- 游戏数据 DLL：`E:\SteamLibrary\steamapps\common\Stardew Valley\StardewValley.GameData.dll`
- SMAPI 兼容 DLL（可选）：`E:\SteamLibrary\steamapps\common\Stardew Valley\StardewModdingAPI.dll`

### 工具

- `ilspycmd`：全局 dotnet tool，用于反编译 .NET DLL
- `python` + `PIL`：用于读取 PNG 尺寸、裁切贴图、快速可视化
- PowerShell `ConvertFrom-Json`：用于快速查看 JSON 数据资产

## 使用方式

### 反编译游戏代码

1. 确认 `ilspycmd` 可用：

   ```powershell
   dotnet tool list --global
   ```

2. 列出 DLL 中的类（用于确认完整类型名）：

   ```powershell
   ilspycmd -l c "E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll" | Select-String "^Class StardewValley\." | Select-Object -First 50
   ```

3. 反编译单个类型到临时文件并搜索：

   ```powershell
   ilspycmd -t "StardewValley.NPC" "E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll" > "C:\Users\26537\AppData\Local\Temp\NPC.cs"
   Select-String -Path "C:\Users\26537\AppData\Local\Temp\NPC.cs" -Pattern "SpriteWidth" -Context 5
   ```

   常用类型示例：
   - `StardewValley.AnimatedSprite`：sprite 源矩形、动画帧计算
   - `StardewValley.Character`：角色绘制、碰撞盒、sprite 加载
   - `StardewValley.NPC`：NPC 数据加载、表情、特殊动画
   - `StardewValley.Farmer`：玩家外观、服装
   - `StardewValley.Game1`：全局工具方法、内容加载入口
   - `StardewValley.GameData.Characters.CharacterData`：原版角色数据字段
   - `StardewValley.GameData.Objects.ObjectData`：原版物品数据字段
   - `StardewValley.GameData.Buildings.BuildingData`：原版建筑数据字段

4. 搜索游戏行为入口：
   在反编译文件中搜索关键字，例如 `GetSourceRect`、`MugShotSourceRect`、`reloadSprite`、`UpdateSourceRect`、`draw`。

### 查询解包数据

1. 快速读取 JSON 资产：

   ```powershell
   $data = Get-Content "E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Data\Characters.json" -Raw | ConvertFrom-Json
   $data.Bear | Select-Object Size, MugShotSourceRect, Breather
   ```

2. 用 Python 提取字段：

   ```python
   import json
   data = json.load(open(r'E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Data\Characters.json'))
   print(data['Bear'].get('Size'))
   print(data['Bear'].get('MugShotSourceRect'))
   ```

   常见数据资产：
   - `Data/Characters.json`：NPC/怪物定义
   - `Data/Objects.json`：物品定义
   - `Data/Buildings.json`：建筑定义
   - `Data/Crops.json` / `Data/FruitTrees.json`：作物/果树
   - `Data/Events/*.json`：事件脚本
   - `Strings/Objects.json` / `Strings/NPCNames.json`：本地化字符串

### 分析贴图资源

1. 查看尺寸：

   ```python
   from PIL import Image
   im = Image.open(r'E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Characters\Bear.png')
   print(im.size)
   ```

2. 按猜测的 frame 尺寸裁剪并保存到临时目录查看：

   ```python
   from PIL import Image

   im = Image.open(r'E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Characters\Bear.png')
   w, h = 32, 32
   cols = im.width // w
   for f in range(min(20, cols * (im.height // h))):
       x = (f % cols) * w
       y = (f // cols) * h
       im.crop((x, y, x + w, y + h)).save(r'C:\Users\26537\AppData\Local\Temp\bear_f%d.png' % f)
   ```

## 常见任务模板

### 验证某个字段的语义

1. 在 `StardewValley.GameData.*` 反编译中查看字段 XML 注释/JSDoc 等效内容。
2. 在 `Stardew Valley.dll` 中搜索对该字段的读取点，确认运行时用途。
3. 在解包 `Data/*.json` 中找一个典型条目对比字段值与贴图表现。

### 验证贴图 frame 尺寸

1. 读 `Data/{Asset}.json` 中的 `Size`、`MugShotSourceRect` 等字段。
2. 读对应 PNG 的 `im.size`。
3. 在 `AnimatedSprite` / `Character` 反编译中确认 `SpriteWidth` 来源。
4. 用 Python 按不同 frame 尺寸（如 16x32、32x32）裁剪比较，找到显示完整图案的尺寸。
5. 在 ModForge 对应解析代码里检查是否采用了与游戏一致的算法。

### 查找某个渲染/动画行为

1. 在反编译文件中搜索方法名，如 `draw`、`UpdateSourceRect`、`GetSourceRect`、`AnimateDown`。
2. 追踪关键字段 `SpriteWidth`、`SpriteHeight`、`CurrentFrame`、`SourceRect`。
3. 如果涉及事件/动画，查 `EventAction` / `FarmerSprite.AnimationFrame` 等类型。

## 输出规范

- 反编译结果只写入 `C:\Users\26537\AppData\Local\Temp\`。
- 截图/裁剪预览也保存到同一目录。
- 不要修改 `Content` / `Content (unpacked)` 目录中的任何文件。
- 不要把临时反编译文件或游戏贴图提交到 ModForge 仓库。

## 输出示例格式

返回结果时，建议按以下结构组织：

1. **查询目标**：要回答的问题。
2. **数据来源**：用了哪个 DLL / JSON / PNG。
3. **关键发现**：列出代码片段、字段值、贴图尺寸等。
4. **对 ModForge 的影响**：说明需要改哪、不改会不会导致当前行为与游戏不一致。
5. **建议修改点**（如有）：给出具体文件/函数，必要时附上伪代码。
