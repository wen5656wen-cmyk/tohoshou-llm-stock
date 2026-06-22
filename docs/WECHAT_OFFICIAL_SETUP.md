# 微信服务号模板消息推送配置指南

## 前置说明

### 普通微信号不能直接推送

微信模板消息发送的目标是 **openid**，不是微信号（w623722555 这类字符串）。

- openid 是用户在**特定服务号**下的唯一 ID，与微信号无关
- 同一个用户在不同服务号下有不同 openid
- 必须先关注该服务号，才能获取该用户在该服务号下的 openid

---

## 环境变量说明

```
WECHAT_OFFICIAL_APP_ID                  服务号的 AppID（公众平台后台 → 设置与开发 → 基本配置）
WECHAT_OFFICIAL_APP_SECRET              服务号的 AppSecret（同上，需 IP 白名单）
WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT 模板消息的模板 ID（见下方申请步骤）
WECHAT_OFFICIAL_TOUSER_OPENID           接收消息的用户 openid（见下方获取方式）
```

---

## Step 1：准备服务号

- 需要**已认证的微信服务号**（订阅号不支持模板消息）
- 登录 [微信公众平台](https://mp.weixin.qq.com)

---

## Step 2：申请模板消息

1. 公众平台后台 → **功能** → **模板消息**
2. 点击「从行业模板库添加」，搜索「股票」「提醒」「业务通知」
3. 推荐申请字段结构：

```
first    自选股风险提醒
keyword1 股票名称
keyword2 风险类型
keyword3 当前价格
keyword4 检测日期
remark   详细说明
```

4. 添加后获取 **模板 ID**（形如 `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`），填入 `WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT`

---

## Step 3：获取用户 openid

### 方式 A：网页授权（推荐）

在服务号关联的网页中通过 OAuth2.0 获取：

```
https://open.weixin.qq.com/connect/oauth2/authorize
  ?appid=APPID
  &redirect_uri=YOUR_CALLBACK_URL
  &response_type=code
  &scope=snsapi_base
  &state=STATE
  #wechat_redirect
```

回调后用 `code` 换取 `openid`：

```
GET https://api.weixin.qq.com/sns/oauth2/access_token
  ?appid=APPID&secret=SECRET&code=CODE&grant_type=authorization_code
```

返回 `{ "openid": "oxxxxxxxxxxxxxxxx", ... }`

### 方式 B：临时二维码扫码

1. 用户扫服务号二维码关注
2. 通过关注事件 push 获取 openid（需配置服务器）

### 方式 C：查询已关注用户列表

```
GET https://api.weixin.qq.com/cgi-bin/user/get?access_token=TOKEN&next_openid=
```

返回 `data.openid[]`，找到对应用户的 openid。

---

## Step 4：小程序 openid vs 服务号 openid

| 场景 | openid |
|------|--------|
| 同一用户在小程序 A | openid_A（只适用于小程序 A） |
| 同一用户在服务号 B | openid_B（只适用于服务号 B） |
| 两者不同，不能混用 | ✗ |

### 通过 UnionID 关联（需开放平台）

如果小程序和服务号都绑定在同一个**微信开放平台账号**下，可通过 `unionid` 关联同一用户：

1. 开放平台绑定小程序和服务号
2. 小程序登录时获取 `unionid`（需 `scope=snsapi_userinfo` 或已关注服务号）
3. 服务号 OAuth 也可获取 `unionid`
4. 用 `unionid` 作为业务用户唯一标识，分别存储两边的 `openid`

---

## Step 5：填入 .env

```bash
WECHAT_OFFICIAL_APP_ID=wx1234567890abcdef
WECHAT_OFFICIAL_APP_SECRET=your_app_secret_here
WECHAT_OFFICIAL_TEMPLATE_ID_STOCK_ALERT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WECHAT_OFFICIAL_TOUSER_OPENID=oXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Step 6：验证

```bash
# 预览 payload（不实际发送）
npm run wechat:watchlist-alerts -- --official-only --dry-run

# 正式推送（需服务号配置完整）
npm run wechat:watchlist-alerts -- --official-only
```

---

## 常见错误码

| errcode | 说明 | 解决 |
|---------|------|------|
| 40001 | access_token 无效 | AppID/AppSecret 错误，或 IP 未加白名单 |
| 40037 | template_id 不存在 | 模板 ID 填错，或该模板未申请 |
| 43004 | 用户未关注 | 目标用户未关注该服务号 |
| 47003 | 模板消息已被删除 | 重新申请模板 |
| 48001 | API 未授权 | 服务号未开启模板消息功能 |

---

## IP 白名单

调用 `https://api.weixin.qq.com/cgi-bin/token` 必须在服务号后台配置 IP 白名单：

**公众平台后台 → 设置与开发 → 基本配置 → IP 白名单**

填入服务器公网 IP（当前生产服务器：`8.209.247.68`）。
