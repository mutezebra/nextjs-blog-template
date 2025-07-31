---
title: "tiktok 中的整洁架构"
description: "tiktok 中的整洁架构"
date: "2024-07-07"
tags: ["architecture","Go","clean-architecture"]
---

或许整洁架构对你而言有些陌生，让你在review代码的时候感到困惑，没关系，我会向你举例帮助你理解他。

这里就以[GitHub - mutezebra/tiktok](https://github.com/mutezebra/tiktok)中`user`的**Register**方法为例。

# 架构：

我们首先来看一下架构图，在此我们主要关注三个层次，从上到下依次为**领域层(domain)**,**用例层(usecase)**和**接口层(interface)**. 接下来我将举例向你解释他们分别的职能，但在此之前我先说一下我对这三个层次的个人见解：

- Domain 着重于提供顶层方法，以便可以被整个架构所引用，同时他负责业务核心代码的实现。
- Usecase 侧重梳理业务逻辑，主要通过引用Domain层暴露出来的接口或方法来实现业务逻辑，并将数据转换成接口层可理解形式返回。
- Interface 着重于处理更底层传来的数据，并将其转换成Usecase或Domain更容易理解和操纵的形式。

在Tiktok中，他大致长这个样子。

![Tiktok-Clean-Architecture](https://picgo-mutezebra.oss-cn-hangzhou.aliyuncs.com/202412310126431.png)

# Register

在整洁架构中，层级分离会屏蔽较底层的代码，高层并不知道底层实现了什么，但是高层又需要底层的方法，所以我们通常会在高层中定义好接口，然后由底层去实现它，最后再在一个地方将其注入进去，这样高层就可以在不知道底层的具体实现的情况下实现调用底层的方法。

## 领域层 Domain

### 1. 定义数据库接口

领域层作为业务的核心处理部分，自然是要统筹全局，提前定义和准备好他所需要的方法。那注册一个用户需要什么呢？首先想到的肯定是把用户信息存储到数据库中啦，但是作于高层来说，自然不需要去做那些脏活累活，我们只需要定义一下这个接口就好了，等下让接口层去做具体的实现。

[app/user/domain/repository/db.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/domain/repository/db.go#L13)

```Go
// UserRepository defines the operational
// criteria for the user repository
type UserRepository interface {
    CreateUser(ctx context.Context, user *User) error // create a new user
}
```

### 2. 定义用户信息结构

好啦，现在已经可以把用户的信息存进数据库了，那用户信息的具体内容呢？好像还没有，那作为高贵的领域层，我们来定义一下用户信息吧。

为了方便管理，我们在`pkg`中创建一个名为`types`的package来统一放置一些由于业务需求而定义的结构体。(`pkg`的方法被全局使用，也可以理解为Domain层)

[pkg/types/model.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/pkg/types/model.go#L4)

```Go
// User is the standards for repo operand objects
type User struct {
    ID             int64  `db:"id"`
    UserName       string `db:"user_name"`
    Email          string `db:"email"`
    PasswordDigest string `db:"password_digest"`
    Gender         int8   `db:"gender"`
    Avatar         string `db:"avatar"`
    Fans           int32  `db:"fans"`
    Follows        int32  `db:"follows"`
    TotpEnable     bool   `db:"totp_enable"`
    TotpSecret     string `db:"totp_secret"`
    CreateAt       int64  `db:"create_at"`
    UpdateAt       int64  `db:"update_at"`
    DeleteAt       int64  `db:"delete_at"`
}
```

### 3. 定义Service结构体

好了，现在用户的信息也有了，那我们看一下这个信息，有username，email，password等等，那自然又引申出一个问题，用户的名字合法吗？email格式是标准的吗?password符合我们的要求吗？存入数据库的话需不需要加密?

那既然这么多的需求摆在这里了，而领域层又作为业务处理的核心部分，自然是需要处理的啦。工欲善其事必先利其器，我们先定义一个`UserService`然后不停的给他添加方法，让他变得完善。

[app/user/domain/service/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/pkg/types/model.go#L4)

```Go
type Service struct {
        Repo               repository.UserRepository
        OSS                model.OSS
        MFA                model.MFA
        Resolver           model.Resolver
        lastServiceAddress map[string]string // service_name -> service_address
}
```

好了，这就是我们的方法，可以看到这里面含有一些接口，比如我们刚刚定义的用来操作数据库的，同样也是Domain层的`repository.UserRepository`，还有一些奇奇怪怪的接口，我们就先不管它了，下一步！

### 4. 用户信息生成与校验

- 生成ID

在分布式系统中,为了保证ID的一致性，当然要使用一些特殊算法，比如这里我们就使用了`pkg`提供的雪花算法，并使用他来生成一个ID。对了，相信看到这里你已经发现了，虽然高层不能调用低层，但是相同层级之间是可以相互调用的。当然，确保你们之间不会造成闭环。

[app/user/domain/service/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/domain/service/user.go#L59)

```Go
func (srv *Service) GenerateID() int64 {
        return snowflake.GenerateID()
}
```

- 校验邮箱格式是否正确

[app/user/domain/service/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/domain/service/user.go#L78)

```Go
func (srv *Service) VerifyEmail(email string) (string, error) {
        _, err := mail.ParseAddress(email)
        if err != nil {
                return "", errors.Wrap(err, "invalid email format")
        }
        return email, nil
}
```

加密与解密的部分我就不多赘述，但是相信你肯定已经懂得了`domain`层以及`domain`中`Service`的作用。那我们接下来说usecase，还记得前面我对他的解释吗？调用`domain`层暴露出来的接口，完成对业务逻辑的梳理，同时也链接起来了`interface`层与`domain`层

## 用例层 Usecase

比较简单，我只做简单的解释。dto只是为了方便数据以不同的形式流通在整个框架中，他并不直接改变数据的元信息，而只是更改形式，方便数据的流动。比如int -> int64

### 1. Usecase 结构体定义

[app/user/usecase/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/usecase/user.go#L17)

```Go
type UserCase struct {
        repo    repository.UserRepository
        service *userService.Service
}
```

很简单，只有两个变量，都是`domain`层暴露出来的接口(结构体)。

### 2. Register 方法逻辑梳理

由于具体的实现早就由 `Interface`层的`Persistence`package或者是`domain`层的`service`实现，我们只需要简单的调用由`domain`所包装好的接口和方法即可。

[app/user/usecase/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/usecase/user.go#L36)

```Go
func (u *UserCase) Register(ctx context.Context, req *idl.RegisterReq) (r *idl.RegisterResp, err error) {
        dto := userDTO{}
        dto.username = req.GetUserName()
        dto.id = u.service.GenerateID() // 调用我们刚刚所说的那个雪花算法的方法

        // 验证邮箱
        if dto.email, err = u.service.VerifyEmail(req.GetEmail()); err != nil {
                return nil, pack.ReturnError(model.EmailFormatError, err)
        }

        // 加密
        if dto.passwordDigest, err = u.service.EncryptPassword(req.GetPassword()); err != nil {
                return nil, pack.ReturnError(model.EncryptPasswordError, err)
        }

        // 向数据库中查询看是否以及存在此人
        if exist, err := u.repo.UserNameExists(ctx, dto.username); err != nil || exist {
                return nil, pack.ReturnError(model.DatabaseUserNameExistsError, err)
        }

        // 创建用户
        if err = u.repo.CreateUser(ctx, dtoU2Repo(&dto)); err != nil {
                return nil, pack.ReturnError(model.DatabaseCreateUserError, err)
        }

        return nil, nil
}
```

## 接口层 Interface

### Gateway

既然我们想要实现一个用户的注册功能，那我们肯定要接收用户的请求，然后根据请求来想办法创建一个用户。那这个接收外部数据转换成架构内部更容易理解形式的层次，我们姑且称之他为接口层。

那我们既然想接收外部的参数，那自然是离不开Http或者rpc，tiktok中就是使用的Http，注册网关来使得架构可以接收外部的请求，而在网关中我们会对外部的数据进行初步的处理，以方便将其传到下一层。

[app/gateway/interface/handler/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/gateway/interface/handler/user.go#L16)

```Go
func UserRegisterHandler() app.HandlerFunc {
    return func(ctx context.Context, c *app.RequestContext) {
       var req user.RegisterReq
       if err := c.BindAndValidate(&req); err != nil {
          pack.SendFailedResponse(c, pack.ReturnError(model.InvalidParamErrno, err))
          return
       }

       resp, err := rpc.Register(ctx, &req)
       if err != nil {
          pack.SendFailedResponse(c, err)
          return
       }

       pack.SendResponse(c, resp)
    }
}
```

我们使用`BindAndValidate`方法来接收并绑定外部传来的参数，然后通过调用`Regiser`方法将其送入到下一步中。

### Persistence

前面我们已经提到了，不管是`domain`还是`usecase`都只是调用了一个操作数据库的接口，但是具体实现还没有展开，没错，就是在`interface`层的`persistence`package中。在这里我们将直接与数据库打交道，并且实现在`domain`中所定义的`UserRepository`接口，从而可以在依赖注入时，可以将此处的结构体注入其中。

#### 1. 结构体定义

```
persistence`中的结构体也叫`UserRepository`，可惜同名不同命，`domain`中的`UserRepository`只是一个接口(此处特指接口类型！go的接口类型)，只需要定义好他需要的接口(方法)即可，而`presistence`中的是一个结构体，需要按照`domain`的要求一个个的去实现那些接口，从而让他们拥有底层的支持。不过也正是因为他们的支持，才可以实现整个架构的职能分离,不然`domain`也只能是空中楼阁，然后在调用时报出`InvalidMemoryAddress
```

[app/user/interface/persistence/database/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/interface/persistence/database/user.go#L14)

```Go
type UserRepository struct {
    db *sql.DB
}
```

#### 2. 实现接口

[app/user/interface/persistence/database/user.go](https://github.com/mutezebra/tiktok/blob/fbdfaa5561d9f66355d331c15c8b22f702e1a1af/app/user/interface/persistence/database/user.go#L23)

```Go
// CreateUser create a repository.User object in database.
func (repo *UserRepository) CreateUser(ctx context.Context, user *repository.User) error {
        _, err := repo.db.ExecContext(ctx,
                "INSERT INTO user(id,user_name,email,password_digest,gender,avatar,fans,follows,totp_enable,totp_secret,create_at,update_at,delete_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ",
                user.ID, user.UserName, user.Email, user.PasswordDigest,
                user.Gender, user.Avatar, user.Fans, user.Follows,
                user.TotpEnable, user.TotpSecret, user.CreateAt, user.UpdateAt,
                user.DeleteAt)
        if err != nil {
                return errors.Wrap(err, "insert item to user failed")
        }
        return nil
}
```

至此我们已经大致的知悉了用户注册的全流程。当然，其实真正的流程不止这么多，比如数据其实还要流过很多中间件，还需要rpc server的支持，gateway也需要调用rpc client来实现完整的功能。但在此我们更多的讨论整洁架构本身，想要了解更多可以直接看源代码，我相信你可以的！