# ShelfTwin 研究方向与学习资料

本文整理讨论过的研究问题和论文入口，便于后续学习。列出的论文不是完整文献综述，也不代表截至 2026 年的最新研究清单。会议信息按对应论文页面记录；候选研究点的新颖性仍需进一步检索验证。

## 1. 项目属于什么方向

当前实现更接近 **事件驱动的视频搜索（event-based video search）**：查询已经结构化的事件，再打开相应视频证据。这里是对产品的描述，不是唯一固定的学术任务名称。

如果系统从未标注视频中理解自然语言查询并找到片段，就进入以下研究任务：

| 任务 | 英文关键词 | 典型输出 |
| --- | --- | --- |
| 按文字(或声音)找相关视频 | Text-to-Video Retrieval | 视频排名 |
| 在一段视频内定位行为 | Video Moment Retrieval / Temporal Grounding | 开始和结束时间 |
| 在视频库中找相关片段 | Video Corpus Moment Retrieval（VCMR） | 视频 ID 和时间区间 |
| 识别动作何时、何处发生 | Spatio-Temporal Action Localization | 动作类别、时间及空间位置 |
| 定位人与商品交互 | Human-Object Interaction Localization | 交互位置、时间、类别 |
| 回答视频内容问题 | Video Question Answering（VideoQA） | 答案，部分任务包含定位依据 |
| 多轮选择证据、补充信息 | Agentic Long-Video Understanding | 工具轨迹、证据和答案 |

ShelfTwin 的潜在组合是：零售交互定位 → 时空事件索引 → 视频证据检索 → 主动调查。跨天跟进和经营干预评估还涉及工作流与因果分析，不能全部归为视频检索。

## 2. 重要区别：长视频与长期任务

长视频理解关注如何在大量帧中定位信息、理解跨时间关系、减少处理成本。

长期调查 Agent 关注如何维护目标、等待新证据、恢复工作、更新假设并完成任务。一次视频问答可以有很多工具轮次，但未必承担跨天任务。

阅读论文时记录：它的 horizon 指视频长度、推理轮数，还是持续任务生命周期？避免把这三种概念混在一起。



## 3. 推荐论文入口

### 3.1 HiREST：检索到证据描述的完整链路

- 标题：**Hierarchical Video-Moment Retrieval and Step-Captioning**。
- 会议：CVPR 2023 主会。
- [论文页面](https://openaccess.thecvf.com/content/CVPR2023/html/Zala_Hierarchical_Video-Moment_Retrieval_and_Step-Captioning_CVPR_2023_paper.html)
- [作者代码](https://github.com/j-min/HiREST)

研究从视频库找相关视频、定位片段，再将片段拆成步骤并描述。数据主要来自教学视频，不能直接等同于门店监控任务。

学习重点：分层检索接口、时间边界、步骤描述，以及各阶段错误如何传递。可以帮助设计 ShelfTwin 的“问题 → 片段 → 证据链”结构。

### 3.2 DrVideo：主动补充缺失证据

- 标题：**DrVideo: Document Retrieval Based Long Video Understanding**。
- 会议：CVPR 2025 主会。
- [论文页面](https://openaccess.thecvf.com/content/CVPR2025/html/Ma_DrVideo_Document_Retrieval_Based_Long_Video_Understanding_CVPR_2025_paper.html)

先把长视频转换为粗粒度文本表示，检索关键帧、补充关键帧信息，再用 Agent 循环寻找缺失信息，直到可以回答。

学习重点：粗索引与细证据如何结合、Agent 如何判断信息缺口、停止机制与成本统计。其主要目标是视频问题回答，不应直接描述为跨天经营调查系统。

### 3.3 VCA：有限预算下主动探索视频

- 标题：**VCA: Video Curious Agent for Long Video Understanding**。
- 会议：ICCV 2025 主会。
- [论文](https://www.openaccess.thecvf.com/content/ICCV2025/papers/Yang_VCA_Video_Curious_Agent_for_Long_Video_Understanding_ICCV_2025_paper.pdf)

通过树搜索探索视频片段，并使用视觉语言模型生成的内在奖励引导探索。

学习重点：如何选择下一段视频、如何衡量探索收益、与均匀采样比较时怎样控制查看成本。重点检查模型自评是否稳定，以及检索失败如何影响最终回答。

### 3.4 RetailAction：零售交互的底层视觉证据

- 标题：**RetailAction: Dataset for Multi-View Spatio-Temporal Localization of Human-Object Interactions in Retail**。
- 会议：ICCV 2025 RetailVision Workshop，非主会论文。
- [论文页面](https://openaccess.thecvf.com/content/ICCV2025W/RetailVision/html/Mazzini_RetailAction_Dataset_for_Multi-View_Spatio-Temporal_Localization_of_Human-Object_Interactions_in_ICCVW_2025_paper.html)

提供真实零售场景的多视角交互样本、交互点、时间范围与动作类别，并研究交互定位基线和评估。

学习重点：标注语义、交互点与人物框的区别、多视角遮挡、评价指标及样本身份范围。项目中的独立演示片段不能据此被当作同店连续购物旅程。

### 3.5 VCMR：视频库中的片段检索

- 标题：**Video Corpus Moment Retrieval with Contrastive Learning**。
- [作者论文预印本](https://arxiv.org/abs/2105.06247)

帮助理解 VCMR 的任务定义：在未裁剪的视频集合中，检索与文本查询对应的时间片段。此处仅列预印本入口，不指定会议归属。

学习重点：视频库检索与视频内定位如何联合评价，候选召回失败和时间定位失败如何区分。

## 4. 候选研究问题

以下是结合项目提出的研究假设，不是已经确认的新颖贡献。

### A. 利用门店空间信息改善视频检索

问题：在相似包装、相似动作很多的门店视频中，货架区域、轨迹和相机关系能否提高证据检索准确率？

比较：纯视频/文本检索、事件过滤、加入货架空间、加入轨迹关系。检查空间标定噪声、陈列变化和事件漏检时是否仍有收益。

关键词：`spatially grounded video retrieval`、`scene graphs for video understanding`、`spatio-temporal event graphs`。这些是搜索词，不一定对应统一的标准任务。

### B. 检索完整的行为证据链

问题：给定“先拿取、离开、再返回放回”，能否找出正确顺序、同一轨迹和对应片段，而非只找到一个相似动作？

需要连续、多事件数据以及关系标注。若涉及跨摄像头，还需要独立评价身份关联；不能将身份条件当成已解决前提。

评估：动作和时间定位、顺序正确性、实体关联、整条证据链是否完整。分别报告组件指标和全链正确率。

关键词：`compositional video retrieval`、`temporal reasoning`、`multi-event video grounding`。

### C. 有限预算下主动收集证据

问题：在相同帧数、视频时长或费用预算下，Agent 能否比固定检索获得更充分的证据？

动作可以是扩大时间窗口、查看另一视角、查询前后事件或获取货架上下文。先统一工具和候选池，避免把更强工具的收益误认为 Agent 策略的收益。

关键词：`agentic video understanding`、`active information gathering`、`budgeted visual reasoning`。

### D. 识别证据不足并停止

问题：严重遮挡、片段缺失、身份不确定或商品候选不唯一时，系统能否明确无法判断，并提出最有价值的补证据动作？

建立可回答和不可回答问题；评价错误断言、覆盖率、正确拒答和预算使用。没有检索到事件不等于证明事件没有发生。

关键词：`selective prediction`、`uncertainty calibration`、`answerability`、`evidence-grounded VideoQA`。

### E. 持续调查与新证据更新

问题：新事件和现场反馈分批到达时，Agent 能否保持 Case 状态、修订假设、避免重复劳动，并及时结束？

评价恢复成功、旧结论修订、重复动作、任务完成和人工跟进时间。它更接近 Agent 工作流评估；要以视觉会议为目标，需要明确视觉证据带来的方法难点。

关键词：`long-horizon agents`、`persistent task state`、`continual evidence integration`、`agent workflow evaluation`。

## 5. 优先实验：行为证据链与主动检索

建议先选 B + C，而不是同时承担所有研究问题。

任务示例：“找到某个货架上，顾客拿取后离开并返回放回的完整证据。”

建立三类问题：单动作、多动作顺序、有缺失或干扰的不可回答问题。数据划分按场景或会话分组，防止同一源视频的近邻片段跨训练和测试造成泄漏。

基线：

1. 结构化事件过滤与确定性时序规则。
2. 固定 top-k 视频检索后一次回答。
3. 均匀采样的视频问答。
4. 使用同样工具、候选池和预算的主动调查 Agent。

指标：片段召回及时间重叠、完整证据链正确率、事实引用正确率、正确拒答、帧数/视频查看时长、延迟和模型费用。报告准确率随预算变化的曲线。

消融：去掉空间上下文、去掉轨迹关系、去掉主动补证据、去掉历史状态。加入映射误差和事件漏检，检查鲁棒性。

原型可先在明确标记的模拟数据上验证管线；要证明真实视觉性能，应使用独立标注的真实数据。不能将演示映射当作空间真值。

## 6. 学习顺序

1. 阅读 RetailAction，弄清当前项目实际拥有的标注与不能支持的结论。
2. 学习 VMR、Temporal Grounding 和 VCMR，理解召回、时间边界与评价口径。
3. 阅读 HiREST，理解多阶段证据处理与错误传播。
4. 阅读 DrVideo 和 VCA，比较主动探索、信息缺口与停止策略。
5. 在 ShelfTwin 实现统一工具层，先建立确定性基线，再加模型。
6. 用少量人工标注问题跑评估，观察 Agent 的收益来自哪里。
7. 再补读持续 Agent 工作流、置信度校准；做干预评估时补充因果推断和实验设计。

每篇论文建议记录：任务输入输出、数据与标注、工具能力、策略、记忆、停止条件、预算、基线、评价指标、失败案例，以及能否迁移到零售视频。

## 7. 关于 CVPR 方向的判断

“聊天框 + 工具调用 + 3D 展示”是产品集成，单独不足以说明研究贡献。更值得验证的方向是：时空结构如何帮助证据链检索，或主动策略如何在同等成本下提高证据完整性。

是否适合投稿需要进一步确认相关工作、明确方法贡献、建立可信数据与评价，并完成基线和消融实验。本文件不对新颖性或录用作判断。
