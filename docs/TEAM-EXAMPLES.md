# Copy-ready group testing examples

## Function questions

Use these in the corresponding language question in VizCode CodeRunner quiz.
Change or add a comment before Check if the answer matches its preloaded text.
For debugging, check the detected function row and enter `5` as its argument.

### Python

```python
def print_factorial(n):
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result
```

### C++ — shared object and independent copy

The C++ question is named “C++ object tracing”. Enter `5` in the function row,
tick it, then step to the loop. `state`, `worker` and `observer` refer to the same
object; `snapshot` is a separate value copy whose total stays `1`.

```cpp
struct FactorialState {
    int input;
    int total;
};

int print_factorial(int n) {
    FactorialState state{n, 1};
    FactorialState snapshot = state;
    FactorialState* worker = &state;
    FactorialState* observer = &state;

    for (int factor = 2; factor <= snapshot.input; ++factor) {
        worker->total *= factor;
    }

    return observer->total;
}
```

Set a breakpoint on `worker->total *= factor;` to inspect the objects before the
function returns. These are local objects, displayed in Objects without using
`new`. The original total reaches `120`; the copy keeps `1`.

### Java — object references, arrays and instance-method frames

The Java question is named “Java object tracing” and uses CodeRunner's Java
class format. Enter `5` beside `FactorialDemo.print_factorial` and tick it.

```java
class FactorialDemo {
    static class FactorialState {
        int total = 1;
        int[] products;

        FactorialState(int count) {
            products = new int[count];
        }

        void multiply(int factor) {
            total *= factor;
            products[factor - 2] = total;
        }
    }

    static int print_factorial(int n) {
        FactorialState state = new FactorialState(Math.max(0, n - 1));
        FactorialState observer = state;
        int[] history = state.products;

        for (int factor = 2; factor <= n; factor++) {
            state.multiply(factor);
        }

        return observer.total;
    }
}
```

Set a breakpoint on `state.multiply(factor);`, then step into the method.
`state`, `observer` and the method's `this` refer to one object. `history` and
`state.products` refer to one array: its zeroes become `[2, 6, 24, 120]`.
Watch the extra call frame appear and the final return value become `120`.
Trying `0` produces an empty array and returns `1`.

Each should pass the prepared factorial test. To demonstrate failure, replace the
`print_factorial` body with `return 0` (and a semicolon for C++/Java), then
Check again.

## Multilingual question

Use these complete programs in VizCode multilingual quiz. Each prints `120`.

### Python

```python
print(120)
```

### C++

```cpp
#include <iostream>
int main() {
    int result = 120;
    std::cout << result << "\n";
}
```

### Java

```java
public class Main {
    public static void main(String[] args) {
        int result = 120;
        System.out.println(result);
    }
}
```

## Interactive input — debugging only

Select Python in the multilingual question and enter:

```python
first = int(input("First number: "))
second = int(input("Second number: "))
print(first + second)
```

Step to the input request, enter `5` and press Enter (or the arrow button).
Continue to the next request, enter `7`, and step to Output: it should show `12`.
This exercise demonstrates debugging only: the prepared quiz expects `120` and
supplies no grading input. Checking this example will not pass that question.
