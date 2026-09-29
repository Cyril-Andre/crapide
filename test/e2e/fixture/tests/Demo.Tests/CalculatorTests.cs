using Demo;
using Xunit;

public class CalculatorTests
{
    [Fact]
    public void PositiveValueIsUnchanged() => Assert.Equal(3, Calculator.Abs(3));
}
