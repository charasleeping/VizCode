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

### C++

```cpp
int print_factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}
```

### Java

```java
static int print_factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}
```

Each should pass the prepared factorial test. To demonstrate failure, replace the
function body with `return 0` (and a semicolon for C++/Java), then Check again.

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
