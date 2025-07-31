---
title: "在Go语言中如何更详细地处理与包装错误"
description: "在Go语言中如何更详细地处理与包装错误"
date: "2024-11-25"
tags: ["Go","error","log"]
---

## 1.Go语言中的错误处理基础

在go语言中，我们使用`error`接口来处理错误，error接口的定义十分简单，只需要包含有 **Error() string** 方法即可。但如何从一层一层的程序中详细完整的传递，记录错误，以及如何去方便快捷的找到错误根源，显然是一个难点。本文就针对这个难点来发表一些浅薄的个人见解。（注：本文更注重于表述个人见解，如若对您有帮助，更建议结合个人项目搭建错误处理与日志体系）

```go
type error interface {
    Error() string
}
```

我认为处理错误的最重要的两点在于错误链与调用栈，当一个`error` 发生时，我们需要在调用处知道完整的错误链，以及在错误发生处知道完整的调用栈，有了这两点我们就既可以得知环环相扣的错误信息，又能根据调用栈直截了当的知晓调用流程和错误源头。本篇文章不会对两者的结合展开叙述，只是单独的解释和演示相关机制。

## 2.Go1.13的错误包装机制

从Go 1.13开始，标准库提供了错误包装功能。你可以使用`fmt.Errorf`和`%w`格式化动词来包装错误，这样可以保留原始错误的上下文信息，同时添加更多描述。

```go
if err := do(); err != nil {
    return fmt.Errorf("failed to do..., %w",err)
}
```

这里给出应用错误链的一个简单demo。

```go
func main() {
	err := do()
	e := errors.Unwrap(err)
	fmt.Printf("err: %v\n", err)
	fmt.Printf("origin: %v\n", e)
}

func do() error {
	if err := learn(); err != nil {
		return fmt.Errorf("do something failed, %w", err)
	}
	return nil
}

func learn() error {
	return fmt.Errorf("can`t learn")
}
```

最终的输出如下：

> err: do something failed, can`t learn
>
> origin: can`t learn

看到这里相信你已经有了一些奇思妙想了，利用错误链的机制不仅可以传递错误信息，还因为`Unwrap`的存在而有了更多可能性，现在我来介绍如何自定义错误类型并传递额外信息。

## 3.自定义错误类型

首先，我们定义一个自己的结构体,和一个满足自己结构体方法的接口。

```go
type Merror interface {
	Error() string
	Extra() any
}

type merror struct {
	msg   string // 存储错误信息
    extra int64 // 存储额外的信息(any type)
}

// New 创建一个新的结构体
func New(msg string, extra ...int64) error {
	e := &merror{
		msg:   msg,
	}
	if extra != nil {
		e.extra = extra[0]
	}
	return e
}

func (e *merror) Error() string {
	return e.msg
}

func (e *merror) Extra() any {
	return e.extra
}

// Format 用于进行格式化的输出，在遇到占位符时转换为我们想要的内容
func (e *merror) Format(state fmt.State, verb rune) {
	switch verb {
	case 's', 'v':
		io.WriteString(state, fmt.Sprintf("msg: %s,extra: %d", e.msg, e.extra))
	}
}
```

我们自定义的`merror` 实现了**Error() string** 与 **Formatter(state,rune)** 接口。对于前者，这意味着`merror` 可以被当成`error` 传递。对于后者，这让我们可以自己实现我们所想要的的输出格式。

## 4.使用自定义错误类型的示例

现在来进行一个demo对上述代码进行演示：

```go
func main() {
	e := merror.New("a error", 1024) // 获取一个新的 error,并传递一个 extra为1024
	fmt.Printf("%s\n", e.Error()) // 输出error的内容,这里应该是a error

	var ex merror.Merror // 声明一个自定义接口的变量，用于判断error是否是merror
	if errors.As(e, &ex) { // 如果是merror的话，就输出Extra方法返回的内容，并且格式化输出 merror
		fmt.Printf("%d\n", ex.Extra())
		fmt.Printf("%v\n", ex) // 这里的%v占位符就对应着上述Format方法中的case 'v'
	}
}

```

最终输出

> a error  
> 1024  
> msg: a error,extra: 1024

到这里让我们简单梳理一下前面都讲了些什么：

1. 实现 **Error() string**方法的结构体都是`error`
2. 利用**fmt.Errorf("%w")** 可以对错误进行封装形成调用链
3. 自定义一个实现了`error`接口的结构体，并包含有额外字段。实现`fmt.Formatter`接口
4. 使用**errors.As()** 获取自定义error的信息

结合所有的这些，相信你对接下来要发生什么已经有所猜测了！没错，我们接下来要在`merror` 中封装一些信息，让我们可以获取到调用栈的信息！(在这里感谢`github.com/pkg/errors`库的贡献者，让我得以踩在巨人的肩膀之上。)

## 5.调用栈信息的获取与封装

接下来的步骤我不会像前面一样直接展示代码再进行解释，而是一点点的与你一同构建。

我们首先要思考的是，到底如何获取调用栈？答案是`runtime`中文名也叫`运行时`，相信你听这个名字就能明白大致的含义。

这里面有一个函数的定义如下：

> Callers(skip int, pc []uintptr) int

使用 **runtime.Callers()** ，就可以将栈的信息存储在**pc**中，我们先skip这个skip变量的含义，先说**pc**的类型，**[]uintptr**中的**uintptr**是什么呢？或许你可以看看这篇文章：[深入探究 uintptr 类型](https://cloud.tencent.com/developer/article/2414117)

现在你可以去试一试这个函数的作用啦，我这里试过了我就继续讲 ^v^

在进行了上述的学习后我想到，要是能包装成一个函数来方便的进行caller的获取就好了，不然每次获取都要定义好麻烦哦，好的这就来了！

```go
func callers() []unitptr {
	const depth = 32
	var pcs [depth]uintptr
	n := runtime.Callers(0, pcs[:]) // 
	var st stack = pcs[0:n]
	return &st
}
```

啥？直接用 **[]uintptr** 传递不好看？含义不明？不方便格式化？你说的有道理，那我们再对其进行封装

```go
type stack []uintptr

func callers() *stack {
	const depth = 32
	var pcs [depth]uintptr
	n := runtime.Callers(0, pcs[:])
	var st stack = pcs[0:n]
	return &st
}

```

嗯，这样看起来好看多啦，那下一步呢？虽然套了层皮，但是那陌生神秘的 **[]uintptr** 该如何转换成我们能看懂的东西呢？简单来说就是怎么格式化为字符串呢？

## 6.调用栈格式化与输出

接下来还是来请出我们还不甚了解的`runtime` 如果你学过计算机组成原理应该知道，有一个特殊的寄存器是用来存储指令地址的，而且还会程序的递增而增加，没错，就是**pc(Program Counter)**, 他存储下一条要执行的指令的地址，而每执行一条指令，pc也会加一，从而指向下一条地址。此时我们stack中的一个个的uintptr我将其理解为一个个pc，(有待考究)，那有了pc我们再使用`runtime` 的函数就可以把我们获取的信息进行格式化。

接下来让我们针对一条**uintptr**来获取 **file**,**line**,和**name**信息

```go
func file(u uintptr) string {
    fn := runtime.FuncForPC(u)
	if fn == nil {
		return "unknown"
	}
    file, _ := fn.FileLine(u)
	return file
}

func line(u uintptr) int {
	fn := runtime.FuncForPC(u)
	if fn == nil {
		return 0
	}
	_, line := fn.FileLine(u)
	return line
}

func name(u uintptr) string {
	fn := runtime.FuncForPC(u)
	if fn == nil {
		return "unknown"
	}
	return fn.Name()
}
```

现在，我们就可以从一条**uintptr**里面获取他包含的上述信息了，此时你是不是觉得可以和`stack` 结合一下准备格式化输出了？对，也不对。此时虽然已经可以了，但是看看上面这么多的函数，优雅吗？不优雅！所以还是让我们使用一个结构体来对其进行包装。

```go
type Frame uintptr

func (f Frame) pc() uintptr { return uintptr(f) - 1 } // 为什么要减1呢？ 因为调用了一个函数pc又加一啦！

func (f Frame) file() string {
	fn := runtime.FuncForPC(f.pc())
	if fn == nil {
		return "unknown"
	}
	file, _ := fn.FileLine(f.pc())
	return file
}

func (f Frame) line() int {
	fn := runtime.FuncForPC(f.pc())
	if fn == nil {
		return 0
	}
	_, line := fn.FileLine(f.pc())
	return line
}

func (f Frame) name() string {
	fn := runtime.FuncForPC(f.pc())
	if fn == nil {
		return "unknown"
	}
	return fn.Name()
}
```

现在看起来是不是优雅多啦？什么？还不够优雅？我也觉得，我们应该把`Frame` 也实现格式化呀！这样`stack`才更方便！说干就干

```go
func (f Frame) Format(s fmt.State, verb rune) {
	switch verb {
	case 's':
		switch {
		case s.Flag('+'):
			io.WriteString(s, f.name())
			io.WriteString(s, "\n\t")
			io.WriteString(s, f.file())
		default:
			io.WriteString(s, path.Base(f.file()))
		}
	case 'd':
		io.WriteString(s, strconv.Itoa(f.line()))
	case 'n':
		io.WriteString(s, funcname(f.name()))
	case 'v':
		f.Format(s, 's')
		io.WriteString(s, ":")
		f.Format(s, 'd')
	}
}

func funcname(name string) string {
	i := strings.LastIndex(name, "/")
	name = name[i+1:]
	i = strings.Index(name, ".")
	return name[i+1:]
}
```

嗯，现在好多了。针对每一个**uintptr**我们都可以使用 **%+v** 对其进行直接的格式化啦。针对一个`stack`，多次调用即可。下面是`stack`的 **Format**

```go
func (s *stack) Format(st fmt.State, verb rune) {
	switch verb {
	case 'v':
		for _, pc := range *s {
			f := Frame(pc)
			fmt.Fprintf(st, "\n%+v", f)
		}
	}
}
```

为了更格式更统一，我们加上一些限制：

```go
func (s *stack) Format(st fmt.State, verb rune) {
	switch verb {
	case 'v':
		switch {
		case st.Flag('+'):
			for _, pc := range *s {
				f := Frame(pc)
				fmt.Fprintf(st, "\n%+v", f)
			}
		}
	}
}
```

## 7.将调用栈集成到自定义错误中

好啦！忙活了这么久，让我们来把`stack`加入到`merror`中

```go
type merror struct {
	msg   string
	extra int64
	*stack      // 注意这里的格式，这是为了让stack直接参与到merror的格式化
}

func New(msg string, extra ...int64) error {
	e := &merror{
		msg:   msg,
		stack: callers(),
	}
	if extra != nil {
		e.extra = extra[0]
	}
	return e
}
```

来让我们检验一下成果吧！

```go
func main() {
	e := merror.New("a error", 1024)
	fmt.Printf("%s\n", e.Error())

	var ex merror.Merror
	if errors.As(e, &ex) {
		fmt.Printf("%d\n", ex.Extra())
		fmt.Printf("%+v\n", ex)		 // 注意改成了+v
	}
}

```

输出结果：

> a error  
> 1024  
> msg: a error,extra: 1024

什么鬼？怎么什么变化都没有的？相信你此刻会有点懵逼，不要着急，是不是忘记了占位符格式化的依据是**Format**方法，而我们此时占位符上的变量可是`merror.Merror` 而不是`stack`哦，再来写上几行吧。

```go
func (e *merror) Format(state fmt.State, verb rune) {
	switch verb {
	case 's', 'v':
		io.WriteString(state, fmt.Sprintf("msg: %s,extra: %d", e.msg, e.extra))
         switch {
             case state.Flag('+'):
             	io.WriteString(state, fmt.Sprintf("%+v", e.stack)) // here！
        }
	}
}

```

输出结果：

```text
a error  
1024  
msg: a error,extra: 1024  
runtime.Callers  
        /usr/local/go/src/runtime/extern.go:331  
mutezebra/pkg/merror.callers  
        /projects/mutezebra/pkg/merror/stack.go:82  
mutezebra/pkg/merror.New  
        /projects/mutezebra/pkg/merror/merror.go:22  
main.main  
        /projects/mutezebra/main.go:10  
runtime.main  
        /usr/local/go/src/runtime/proc.go:272  
runtime.goexit  
        /usr/local/go/src/runtime/asm_amd64.s:1700 
```
 

看到这里是不是觉得大功告成了？是的，我想说的就这些啦。

## 8.结尾

彩蛋：还记不记得我们前面有一个skip掉的`runtime.Caller()`的skip变量，去试试怎么回事吧！

源代码文件：[merror](https://github.com/mutezebra/blogResource-external/tree/main/codes/merror)

